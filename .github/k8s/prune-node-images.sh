#!/usr/bin/env bash
# Remove unused starwards images from every node's containerd.
#
# Runs one privileged pod per node that chroots into the host and removes each
# image of ghcr.io/starwards/starwards (and its preview-* packages) that no
# container on the node references. Other images are never touched. A failing
# node is reported and skipped; the script exits non-zero if any node failed.
#
# Usage: prune-node-images.sh   (env: KUBECONFIG, optional GITHUB_RUN_ID)
set -uo pipefail

# Runs on the host. containerd has no in-use check of its own, so collect every
# image ID referenced by any container (running or exited) and keep those.
read -r -d '' prune <<'SH' || true
export PATH="$PATH:/usr/local/bin"
used=$(k3s crictl ps -a -o json | grep -o 'sha256:[0-9a-f]\{64\}' | sort -u)
for id in $(k3s crictl images --no-trunc | awk '$1 ~ /^ghcr\.io\/starwards\/starwards(\/preview-|$)/ {print $3}' | sort -u); do
    if echo "$used" | grep -qx "$id"; then continue; fi
    k3s crictl rmi "$id" >/dev/null && echo "removed $id"
done
SH

phase_of() { kubectl get pod -n kube-system "$1" -o jsonpath='{.status.phase}' 2>/dev/null; }

failed=0
for node in $(kubectl get nodes -o jsonpath='{.items[*].metadata.name}'); do
    pod="prune-images-${node}-${GITHUB_RUN_ID:-$$}"
    phase=""
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
        failed=1
    fi
    kubectl delete pod -n kube-system "$pod" --ignore-not-found --wait=false >/dev/null
done
exit "$failed"
