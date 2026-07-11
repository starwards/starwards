#!/usr/bin/env bash
# Build & push one preview image per compose service, baking bind mounts in.
#
# Compose bind-mounts repo dirs (configs, node-red flows, O-S-C sessions).
# Previews run on the cluster where those host paths don't exist, so for each
# service we build a thin wrapper image `FROM <its image>` + `COPY` of every
# bind-mount source, and the k8s renderer (render-preview.js) mounts nothing.
# Services with a `build:` section are built first and used as the wrapper base.
#
# Usage: build-preview-images.sh <compose-config.json>
#   env: IMAGE_PREFIX  e.g. ghcr.io/starwards/starwards/preview
#        TAGS          space-separated tags to push, e.g. "abc123def456 pr-42"
#        COMPOSE_DIR   compose project dir (build context for wrappers)
# stdout: JSON map { "<compose service>": "<image ref>" } — everything else
# goes to stderr.
set -euo pipefail

COMPOSE_JSON="$1"
: "${IMAGE_PREFIX:?}" "${TAGS:?}" "${COMPOSE_DIR:?}"

MAIN_TAG=$(cut -d' ' -f1 <<<"$TAGS")
declare -A RESULT

tag_args() { # tag_args <repo> -> "-t repo:tag1 -t repo:tag2"
    local repo="$1" out=""
    for t in $TAGS; do out+=" -t ${repo}:${t}"; done
    echo "$out"
}

# tr -d '\r': jq on Windows emits CRLF; harmless on the Linux CI runner
for svc in $(jq -r '.services | keys[]' "$COMPOSE_JSON" | tr -d '\r'); do
    svc_json=$(jq --arg s "$svc" '.services[$s]' "$COMPOSE_JSON")
    name=$(tr '[:upper:]' '[:lower:]' <<<"$svc" | tr -c 'a-z0-9-' '-' | sed 's/-*$//')
    has_build=$(jq 'has("build")' <<<"$svc_json")
    mapfile -t binds < <(jq -r '(.volumes // [])[] | select(.type == "bind") | .source + "|" + .target' <<<"$svc_json" | tr -d '\r')

    # 1. Resolve the base image: per-PR build, or the upstream compose image.
    if [ "$has_build" = "true" ]; then
        ctx=$(jq -r '.build.context' <<<"$svc_json")
        dockerfile=$(jq -r '.build.dockerfile // "Dockerfile"' <<<"$svc_json")
        if [ "${#binds[@]}" -eq 0 ]; then
            # No mounts to bake — the built image IS the final image.
            final="${IMAGE_PREFIX}-${name}"
            # shellcheck disable=SC2046
            docker buildx build --push $(tag_args "$final") \
                --cache-from type=gha,scope="preview-${name}" \
                --cache-to type=gha,mode=max,scope="preview-${name}" \
                -f "${ctx}/${dockerfile}" "$ctx" >&2
            RESULT[$svc]="${final}:${MAIN_TAG}"
            continue
        fi
        base="${IMAGE_PREFIX}-${name}-base:${MAIN_TAG}"
        docker buildx build --push -t "$base" \
            --cache-from type=gha,scope="preview-${name}" \
            --cache-to type=gha,mode=max,scope="preview-${name}" \
            -f "${ctx}/${dockerfile}" "$ctx" >&2
    else
        base=$(jq -r '.image' <<<"$svc_json")
        if [ "${#binds[@]}" -eq 0 ]; then
            # Nothing to bake — use the upstream image as-is.
            RESULT[$svc]="$base"
            continue
        fi
    fi

    # 2. Generate the wrapper Dockerfile. COPY --chown to the image's USER so
    # services that write into a baked dir (e.g. node-red's /data) still can.
    # Label hooks: `starwards.preview.pre-run` runs BEFORE the COPYs (stable
    # deps → cached docker layer), `starwards.preview.run` after them (deps on
    # baked files that change every build).
    pre_run=$(jq -r '.labels["starwards.preview.pre-run"] // empty' <<<"$svc_json" | tr -d '\r')
    post_run=$(jq -r '.labels["starwards.preview.run"] // empty' <<<"$svc_json" | tr -d '\r')
    docker pull "$base" >&2
    user=$(docker image inspect -f '{{.Config.User}}' "$base" | tr -d '\r')
    chown_flag=""
    [ -n "$user" ] && chown_flag="--chown=${user}"
    wrapper_df=$(mktemp)
    echo "FROM ${base}" >"$wrapper_df"
    [ -n "$pre_run" ] && echo "RUN ${pre_run}" >>"$wrapper_df"
    for bind in "${binds[@]}"; do
        src="${bind%%|*}" target="${bind##*|}"
        # gitignored runtime dirs (e.g. mqtt/data) don't exist on a fresh
        # clone — bake them as empty dirs
        mkdir -p "$src"
        rel=$(realpath --relative-to="$COMPOSE_DIR" "$src")
        case "$rel" in
        ..*)
            echo "ERROR: bind mount ${src} of service ${svc} is outside ${COMPOSE_DIR}" >&2
            exit 1
            ;;
        esac
        echo "COPY ${chown_flag} ${rel} ${target}" >>"$wrapper_df"
    done
    [ -n "$post_run" ] && echo "RUN ${post_run}" >>"$wrapper_df"
    cat "$wrapper_df" >&2

    final="${IMAGE_PREFIX}-${name}"
    # shellcheck disable=SC2046
    docker buildx build --push $(tag_args "$final") \
        --cache-from type=gha,scope="preview-${name}-wrapper" \
        --cache-to type=gha,mode=max,scope="preview-${name}-wrapper" \
        -f "$wrapper_df" "$COMPOSE_DIR" >&2
    RESULT[$svc]="${final}:${MAIN_TAG}"
done

for svc in "${!RESULT[@]}"; do
    jq -n --arg k "$svc" --arg v "${RESULT[$svc]}" '{($k): $v}'
done | jq -cs 'add // {}'
