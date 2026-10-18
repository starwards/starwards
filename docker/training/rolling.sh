#!/bin/sh
# One cycle of a rolling lane: fresh seeds every cycle, a rung picked by rotation, then the cumulative
# mining of that rung rebuilt. Run by the rolling-* CronJobs (deploy/k3s/training, JOB=rolling); see
# docs/integration/ai-training-k3s.md, "Continuous training".
#
#   LANE         branch (record + branch corpus) | sweep (reference crews side by side on the same seeds)
#   RUNGS        comma-separated rungs, one per cycle in turn
#   LEVEL_SETS   branch: '|'-separated level sets, the next set after each full turn of RUNGS;
#                button sets read button:<station>:<control>
#   SEEDS        seeds per cycle; BUDGET branches per cycle (branch); CREWS crews (sweep; the first is the reference)
#   TIMEOUTS     per-rung run timeout, e.g. W-waves=1800 (default: run-job's)
#
# State lives under ARCHIVE/mining (outside the day folders, so retention keeps it):
#   mining/_lanes/<lane>/cycles.jsonl   one line per cycle started: its seeds are never used again
#   mining/<rung>/branches-<commit>.jsonl, sweep-<commit>.jsonl   every branch / run row of that code
#   mining/<rung>/LATEST.md             the current commit's cumulative findings (mining.py)
set -eu

ARCHIVE=${ARCHIVE:-/training-archive}
LANE=${LANE:?LANE is required}
COMMIT=${GIT_COMMIT:-unknown}
MINING=$ARCHIVE/mining
STATE=$MINING/_lanes/$LANE
mkdir -p "$STATE"
touch "$STATE/cycles.jsonl"

# fillers of one lane can run at once: claim the cycle under a lock (mkdir is atomic, on NFS too)
lock=$STATE/.lock
tries=0
until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -lt 60 ] || { rmdir "$lock" 2>/dev/null || true; tries=0; }
    sleep 1
done
cycle=$(wc -l <"$STATE/cycles.jsonl" | tr -d ' ')
pick() { printf '%s' "$1" | tr "$2" '\n' | sed -n "$(($3 + 1))p"; }
count() { printf '%s' "$1" | tr "$2" '\n' | grep -c .; }

nrungs=$(count "$RUNGS" ,)
rung=$(pick "$RUNGS" , $((cycle % nrungs)))
seeds=${SEEDS:-4}
# lanes draw from disjoint seed blocks far above the curriculum's 1-16: held out from every baseline
case "$LANE" in branch) base=100000 ;; sweep) base=500000 ;; *) base=900000 ;; esac
first=$((base + cycle * 100))
[ "$seeds" -le 100 ] || { echo "SEEDS must be <= 100"; exit 2; }
day=$(date -u +%F)
timeout=$(printf '%s' "${TIMEOUTS:-}" | tr ',' '\n' | sed -n "s/^$rung=//p")
[ -n "$timeout" ] && export TIMEOUT=$timeout

kind=$LANE

levels=
branch_args=
if [ "$kind" = branch ]; then
    nsets=$(count "${LEVEL_SETS:-strategic,tactical}" '|')
    set_=$(pick "${LEVEL_SETS:-strategic,tactical}" '|' $(((cycle / nrungs) % nsets)))
    case "$set_" in
    button:*)
        levels=button
        branch_args="--station $(printf '%s' "$set_" | cut -d: -f2) --control $(printf '%s' "$set_" | cut -d: -f3)"
        ;;
    *) levels=$set_ ;;
    esac
fi

run=rolling-$LANE-c$cycle-$(printf '%s' "$rung" | tr 'A-Z' 'a-z')
# claim the seeds before playing them: a failed cycle's seeds are burnt, never replayed
printf '{"cycle":%s,"lane":"%s","kind":"%s","rung":"%s","firstSeed":%s,"seeds":%s,"levels":"%s","commit":"%s","day":"%s","run":"%s","started":"%s"}\n' \
    "$cycle" "$LANE" "$kind" "$rung" "$first" "$seeds" "$levels" "$COMMIT" "$day" "$run" "$(date -u +%FT%TZ)" >>"$STATE/cycles.jsonl"
rmdir "$lock"
echo "cycle $cycle of lane $LANE: $kind on $rung, seeds $first-$((first + seeds - 1)) ${levels:+levels $levels }commit $COMMIT"

mkdir -p "$MINING/$rung"
export RUN_NAME=$run RUN_DATE=$day SHARDS=1 JOB_COMPLETION_INDEX=0 FIRST_SEED=$first SEEDS_PER_SHARD=$seeds SCENARIO=$rung
status=0
case "$kind" in
branch)
    # record with the reference crew only: the branches leave its runs
    CREWS=$(printf '%s' "$CREWS" | cut -d, -f1) LEVELS=$levels BRANCH_ARGS=$branch_args run-job branch || status=$?
    rows=$ARCHIVE/$day/branching/$run-corpus/branches.jsonl
    if [ "$status" = 0 ] && [ -s "$rows" ]; then
        cat "$rows" >>"$MINING/$rung/branches-$COMMIT.jsonl"
    fi
    ;;
sweep)
    run-job train || status=$?
    rows=$ARCHIVE/$day/headless/$run/$rung-crews.json
    if [ "$status" = 0 ] && [ -s "$rows" ]; then
        python3 -c 'import json,sys; [print(json.dumps({k: r.get(k) for k in ("crew","seed","killed","kills","seconds","score")})) for r in json.load(open(sys.argv[1]))]' "$rows" \
            >>"$MINING/$rung/sweep-$COMMIT.jsonl"
    fi
    ;;
esac

# several fillers may finish together: one summary at a time
tries=0
until mkdir "$MINING/$rung/.lock" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -lt 60 ] || { rmdir "$MINING/$rung/.lock" 2>/dev/null || true; tries=0; }
    sleep 2
done
python3 /app/mining.py "$MINING/$rung" "$COMMIT" "$rung" || echo "mining summary failed"
rmdir "$MINING/$rung/.lock"
printf '{"cycle":%s,"lane":"%s","status":%s,"finished":"%s"}\n' "$cycle" "$LANE" "$status" "$(date -u +%FT%TZ)" >>"$STATE/results.jsonl"
exit "$status"
