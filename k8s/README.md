# Cyber Sentinel — k3s Manifests

Single-node k3s deployment scoped to the Ubuntu VM (10.4.89.178, 7.8 GB RAM, 4 CPU).

## Prerequisites

1. **Disk cleanup** (run on VM first — reclaims ~10–12 GB):
   ```bash
   docker image prune -a
   docker volume prune
   docker builder prune
   df -h /   # verify ≥ 15 GB free
   ```

2. **k3s install**:
   ```bash
   curl -sfL https://get.k3s.io | sh -
   sudo chmod 644 /etc/rancher/k3s/k3s.yaml
   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
   kubectl get nodes
   ```

3. **Build and import images**:
   ```bash
   docker build -t cyber-sentinel/backend:latest ./backend
   docker build -t cyber-sentinel/frontend:latest ./frontend
   docker save cyber-sentinel/backend:latest | sudo k3s ctr images import -
   docker save cyber-sentinel/frontend:latest | sudo k3s ctr images import -
   sudo k3s ctr images list | grep cyber-sentinel
   ```

4. **MongoDB dump** (while Docker Compose is still running):
   ```bash
   docker exec cyber-sentinel-mongo mongodump --out /tmp/mongodump
   docker cp cyber-sentinel-mongo:/tmp/mongodump ./mongodump-backup
   ```

## Deploy

```bash
# Fill in secret.yaml values from your .env first!
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/statefulsets/
kubectl apply -f k8s/services/
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/pdb/
kubectl apply -f k8s/ingress/

# Restore MongoDB data
kubectl cp ./mongodump-backup cyber-sentinel/mongodb-0:/tmp/mongodump
kubectl exec -n cyber-sentinel mongodb-0 -- mongorestore /tmp/mongodump

# Watch pods come up
kubectl -n cyber-sentinel get pods -w
```

## Important: forwarder.yaml

Update the `hostPath` for the `scripts` volume to the actual project path on the VM:
```yaml
hostPath:
  path: /opt/cyber-sentinel/scripts   # ← change this
```

## RAM budget

| Workload | Limit |
|---|---|
| k3s overhead | ~700 Mi |
| backend ×2 | 512 Mi |
| frontend | 64 Mi |
| celery-scan ×2 | 256 Mi |
| celery-soc ×2 | 256 Mi |
| celery-report | 64 Mi |
| celery-beat | 64 Mi |
| forwarder | 32 Mi |
| mongodb | 512 Mi |
| redis | 128 Mi |
| zap | 800 Mi |
| **Total** | **~3.4 GB** |

~4.4 GB remaining for OS + kernel buffers.

## Singleton guarantees

- `celery-beat`: `replicas: 1` + PDB. Never scale up — two Beat pods = duplicate task dispatch.
- `forwarder`: `replicas: 1` + PDB. Never scale up — two forwarders reading the same log = duplicate alerts. The Redis poll lock (Fix 1) and per-alert SETNX dedup (Fix 2) are backup guards, not substitutes.

## What's left for the next project holder

- KEDA queue-depth autoscaling
- HPA on backend/workers
- ZAP as K8s Job per scan (needs 16 GB+ RAM)
- Multi-node k3s cluster
- MongoDB replica set
- Redis Sentinel / Cluster
- redbeat (distributed Beat scheduler)
