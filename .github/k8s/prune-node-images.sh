#!/usr/bin/env bash
# Remove unused starwards images from every node's containerd.
#
# Runs one privileged pod per node, all at once, that chroots into the host
# and removes each image of <image> (and its <image>/preview-* packages) that
# no container on the node references. Other images are never touched. A
# failing node is reported and skipped; the script exits non-zero if any did.
#
# Usage: prune-node-images.sh <image>   (env: KUBECONFIG; optional
#        GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT to name the pods)
set -uo pipefail

image=${1:?usage: prune-node-images.sh <image>}

# Runs on the host (IMAGE in its env). containerd has no in-use check of its
# own, so collect every image ID referenced by any container (running or
# exited) and keep those. Fails closed: without a container list, remove nothing.
read -r -d '' prune <<'SH' || true
export PATH="$PATH:/usr/local/bin"
command -v k3s >/dev/null || { echo "k3s not found"; exit 1; }
containers=$(k3s crictl ps -a -o json) || { echo "crictl ps failed"; exit 1; }
used=$(echo "$containers" | grep -o 'sha256:[0-9a-f]\{64\}' | sort -u)
[ -n "$used" ] || { echo "no containers listed; refusing to prune"; exit 1; }
images=$(k3s crictl images --no-trunc) || { echo "crictl images failed"; exit 1; }
for id in $(echo "$images" | awk -v repo="$IMAGE" '$1 == repo || index($1, repo "/preview-") == 1 {print $3}' | sort -u); do
    if echo "$used" | grep -qx "$id"; then continue; fi
    k3s crictl rmi "$id" >/dev/null && echo "removed $id"
done
SH

phase_of() { kubectl get pod -n kube-system "$1" -o jsonpath='{.status.phase}' 2>/dev/null; }

failed=0
prune_node() {
    local node=$1 pod phase="" rc=0
    pod="prune-images-${node}-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
    if kubectl apply -f - >/dev/null <<YAML; then
apiVersion: v1
kind: Pod
metadata:
  name: ${pod}
  namespace: kube-system
spec:
  nodeName: ${node}
  restartPolicy: Never
  containers:
    - name: prune
      image: busybox:1.37
      securityContext:
        privileged: true
      env:
        - name: PRUNE
          value: $(jq -Rs . <<<"$prune")
        - name: IMAGE
          value: $(printf %s "$image" | jq -Rs .)
      command: [chroot, /host, sh, -c, 'eval "\$PRUNE"']
      volumeMounts:
        - name: host
          mountPath: /host
  volumes:
    - name: host
      hostPath:
        path: /
YAML
        # stop at Succeeded or Failed; only Pending/Running uses the timeout
        for _ in $(seq 90); do
            phase=$(phase_of "$pod")
            [[ $phase == Succeeded || $phase == Failed ]] && break
            sleep 2
        done
    fi
    if [[ $phase == Succeeded ]]; then
        echo "${node}: $(kubectl logs -n kube-system "$pod" | grep -c '^removed') image(s) removed"
    else
        echo "::warning::${node}: image prune ${phase:-not started}"
        kubectl logs -n kube-system "$pod" 2>/dev/null | tail -5
        rc=1
    fi
    kubectl delete pod -n kube-system "$pod" --ignore-not-found --wait=false >/dev/null
    return "$rc"
}

# all nodes at once; each prune is independent
pids=()
for node in $(kubectl get nodes -o jsonpath='{.items[*].metadata.name}'); do
    prune_node "$node" &
    pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
exit "$failed"
