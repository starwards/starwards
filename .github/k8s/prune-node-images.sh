#!/usr/bin/env bash
# Remove cached starwards preview images from every node's containerd.
#
# Runs one privileged pod per node that chroots into the host and calls
# `k3s crictl rmi` on each image of ghcr.io/starwards/starwards and its
# preview-* packages. containerd refuses to remove an image a container still
# uses, so live previews and master keep theirs; everything else is evicted.
#
# Usage: prune-node-images.sh   (env: KUBECONFIG)
set -euo pipefail

read -r -d '' prune <<'SH' || true
export PATH="$PATH:/usr/local/bin"
for id in $(k3s crictl images | awk '$1 ~ /^ghcr\.io\/starwards\/starwards(\/preview-|$)/ {print $3}' | sort -u); do
    k3s crictl rmi "$id" >/dev/null 2>&1 && echo "removed $id" || true
done
SH

for node in $(kubectl get nodes -o jsonpath='{.items[*].metadata.name}'); do
    pod="prune-images-${node}"
    kubectl delete pod -n kube-system "$pod" --ignore-not-found >/dev/null
    kubectl apply -f - >/dev/null <<YAML
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
      command: [chroot, /host, sh, -c, $(jq -Rs . <<<"$prune")]
      volumeMounts:
        - name: host
          mountPath: /host
  volumes:
    - name: host
      hostPath:
        path: /
YAML
    kubectl wait -n kube-system "pod/${pod}" --for=jsonpath='{.status.phase}'=Succeeded --timeout=180s >/dev/null
    echo "${node}: $(kubectl logs -n kube-system "$pod" | wc -l) image(s) removed"
    kubectl delete pod -n kube-system "$pod" --wait=false >/dev/null
done
