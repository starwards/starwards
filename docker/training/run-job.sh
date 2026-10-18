#!/bin/sh
# Entry point of the training image. The job spec comes from the environment (the first argument
# overrides JOB); see docs/integration/ai-training-k3s.md.
#
#   JOB              train | branch | suite | merge | help
#   RUN_NAME         run folder name (default: the Kubernetes job name, else JOB-SCENARIO)
#   RUN_DATE         archive day YYYY-MM-DD (default: from a CronJob's job name, else today UTC)
#   ARCHIVE          archive root, laid out as training-archive (default /training-archive)
#   SCENARIO         training rung, e.g. T3-directed                         (train, branch)
#   CREWS            comma-separated crew files, relative to modules/ai     (train, branch: the first; suite: the first)
#   SEEDS_PER_SHARD  seeds per shard (default 2)                             (train, branch)
#   FIRST_SEED       first seed of shard 0 (default 1)                       (train, branch)
#   SHARDS           shard count, equal to the Job's completions (default 1)
#   JOB_COMPLETION_INDEX  this shard (set by an Indexed Job; default 0)
#   WORKERS          worker processes in this pod (default 1)
#   TIMEOUT          seconds per run (train default 300, branch default 400)
#   BUDGET           branches per shard (default 25)                         (branch)
#   LEVELS           branch decision levels (default strategic,tactical) / suite levels (default all)
#   BASELINE         suite baseline name (default the crew's)                (suite)
#   HEAP_MB          V8 old-space cap per process (default 4096)
#   EXTRA_ARGS       appended to the CLI call
#   KEEP_SHARDS      1 keeps _shards/<date>/<run> after a merge (default 0)
#
# Every shard writes ARCHIVE/_shards/<date>/<run>/shard-<i>/ and a `done` marker; the shard that
# completes the set merges them into the archive day and rebuilds its manifest.jsonl.
set -eu

JOB=${1:-${JOB:-help}}
ARCHIVE=${ARCHIVE:-/training-archive}
AI=/app/modules/ai
IDX=${JOB_COMPLETION_INDEX:-0}
SHARDS=${SHARDS:-1}
WORKERS=${WORKERS:-1}
HEAP_MB=${HEAP_MB:-4096}
JOB_NAME=${JOB_NAME:-}

if [ -z "${RUN_DATE:-}" ]; then
    # a CronJob names its Jobs <cronjob>-<scheduled minutes since epoch>: every shard agrees on the day
    minutes=$(printf '%s' "$JOB_NAME" | sed -n 's/.*-\([0-9]\{8,\}\)$/\1/p')
    if [ -n "$minutes" ]; then
        RUN_DATE=$(date -u -d "@$((minutes * 60))" +%F)
    else
        RUN_DATE=$(date -u +%F)
    fi
fi
RUN_NAME=${RUN_NAME:-${JOB_NAME:-$JOB-${SCENARIO:-run}}}
SHARD_ROOT=$ARCHIVE/_shards/$RUN_DATE/$RUN_NAME
SHARD_DIR=$SHARD_ROOT/shard-$IDX

# the engine and code a folder's runs were made on; merge-shards refuses to mix them
stamp() {
    mkdir -p "$1"
    printf '{"node":"%s","commit":"%s"}\n' "$(node -v)" "${GIT_COMMIT:-unknown}" >"$1/runtime.json"
}

first_crew() { printf '%s' "${CREWS:?CREWS is required}" | cut -d, -f1; }
crew_args() { printf '%s' "${CREWS:?CREWS is required}" | tr ',' '\n' | sed 's/^/--crew /' | tr '\n' ' '; }
cli() {
    script=$1
    shift
    cd "$AI"
    # shellcheck disable=SC2086
    node --max-old-space-size="$HEAP_MB" -r ts-node/register/transpile-only "src/$script" "$@" ${EXTRA_ARGS:-}
}

shard_seeds() {
    per=${SEEDS_PER_SHARD:-2}
    SHARD_FIRST=$((${FIRST_SEED:-1} + IDX * per))
    SHARD_COUNT=$per
    echo "shard $IDX/$SHARDS: seeds $SHARD_FIRST-$((SHARD_FIRST + per - 1)), $WORKERS worker(s), run $RUN_DATE/$RUN_NAME"
}

train_shard() {
    shard_seeds
    # shellcheck disable=SC2046
    cli cli/train.ts --scenario "${SCENARIO:?SCENARIO is required}" $(crew_args) \
        --first-seed "$SHARD_FIRST" --seeds "$SHARD_COUNT" --timeout "${TIMEOUT:-$1}" \
        --workers "$WORKERS" --out "$SHARD_DIR/runs"
    stamp "$SHARD_DIR"
}

manifest() {
    ARCHIVE="$ARCHIVE" python3 /app/build_manifest.py "$RUN_DATE" "${GIT_COMMIT:-unknown}"
}

merge() {
    kind=${KIND:-$(test -d "$SHARD_ROOT/shard-0/corpus" && echo branch || echo train)}
    day=$ARCHIVE/$RUN_DATE
    if [ "$kind" = branch ]; then
        cli cli/merge-shards.ts --shards "$SHARD_ROOT" --scenario "$SCENARIO" \
            --runs-out "$day/branching/$RUN_NAME-runs" --corpus-out "$day/branching/$RUN_NAME-corpus" || status=$?
    else
        cli cli/merge-shards.ts --shards "$SHARD_ROOT" --scenario "$SCENARIO" --runs-out "$day/headless/$RUN_NAME" || status=$?
    fi
    manifest
    if [ "${status:-0}" = 0 ] && [ "${KEEP_SHARDS:-0}" != 1 ]; then rm -rf "$SHARD_ROOT"; fi
    return "${status:-0}"
}

# the last shard to finish merges; mkdir is the atomic claim
finish_shard() {
    touch "$SHARD_DIR/done"
    done_count=$(find "$SHARD_ROOT" -mindepth 2 -maxdepth 2 -name done | wc -l)
    if [ "$done_count" -ge "$SHARDS" ] && mkdir "$SHARD_ROOT/.merging" 2>/dev/null; then
        echo "all $SHARDS shard(s) done: merging"
        merge
    else
        echo "$done_count/$SHARDS shard(s) done"
    fi
}

case "$JOB" in
train)
    train_shard 300
    finish_shard
    ;;
branch)
    # record this shard's seeds, then branch them on the same code (a branch replays its recording from the seed)
    train_shard 400
    cli cli/branch.ts corpus --runs "$SHARD_DIR/runs" --crew "$(first_crew)" --scenario "$SCENARIO" \
        --levels "${LEVELS:-strategic,tactical}" --budget "${BUDGET:-25}" --workers "$WORKERS" --out "$SHARD_DIR/corpus"
    finish_shard
    ;;
suite)
    crew=$(first_crew)
    name=$(node -p "require('$AI/$crew').name")
    out=$ARCHIVE/$RUN_DATE/suite/$name-$(date -u +%H%M%S)
    set -- --crew "$crew" --workers "$WORKERS" --out "$out"
    [ -n "${LEVELS:-}" ] && set -- "$@" --levels "$LEVELS"
    [ -n "${BASELINE:-}" ] && set -- "$@" --baseline "$BASELINE"
    cli cli/suite.ts "$@" || status=$?
    stamp "$out"
    manifest
    [ "${status:-0}" = 0 ] || echo "suite: regression against the baseline (see $out/suite.md)"
    exit "${status:-0}"
    ;;
merge)
    merge
    ;;
help | *)
    sed -n '2,24p' "$0"
    ;;
esac
