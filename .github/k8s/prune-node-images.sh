#!/usr/bin/env bash
# Remove unused images from every node's containerd.
#
# Runs one privileged pod per node that chroots into the host and calls
# `k3s crictl rmi --prune`, which removes only images no container uses, so
# live previews and master keep theirs. A failing node is reported and
# skipped; the script exits non-zero at the end if any node failed.
#
# Usage: prune-node-images.sh   (env: KUBECONFIG, optional GITHUB_RUN_ID)
set -uo pipefail

failed=0
for node in $(kubectl get nodes -o jsonpath='{.items[*].metadata.name}'); do
    pod="prune-images-${node}-${GITHUB_RUN_ID:-$$}"
    if kubectl apply -f - >/dev/null <<YAML &&
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
      command: [chroot, /host, sh, -c, 'PATH="\$PATH:/usr/local/bin" k3s crictl rmi --prune']
      volumeMounts:
        - name: host
          mountPath: /host
  volumes:
    - name: host
      hostPath:
        path: /
YAML
        kubectl wait -n kube-system "pod/${pod}" --for=jsonpath='{.status.phase}'=Succeeded --timeout=180s >/dev/null; then
        echo "${node}: $(kubectl logs -n kube-system "$pod" | grep -c '^Deleted') image(s) removed"
    else
        echo "::warning::${node}: image prune failed"
        kubectl logs -n kube-system "$pod" 2>/dev/null | tail -5
        failed=1
    fi
    kubectl delete pod -n kube-system "$pod" --ignore-not-found --wait=false >/dev/null
done
exit "$failed"
