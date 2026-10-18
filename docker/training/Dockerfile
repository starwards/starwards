# Headless training image: modules/ai train / suite / branch CLIs over core, bots and server.
# Build from the repo root:  docker build -f docker/training/Dockerfile -t <registry>/starwards-training:<commit> --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) .
# Usage and the K3S jobs that run it: docs/integration/ai-training-k3s.md

# node 24.18.0 (.nvmrc), bookworm-slim
ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY modules/ai/package.json modules/ai/
COPY modules/bots/package.json modules/bots/
COPY modules/browser/package.json modules/browser/
COPY modules/core/package.json modules/core/
COPY modules/mcp/package.json modules/mcp/
COPY modules/node-red/package.json modules/node-red/
COPY modules/server/package.json modules/server/

# core and bots resolve through their cjs builds
FROM manifests AS build
RUN npm ci --no-audit --no-fund --include-workspace-root \
    -w @starwards/core -w @starwards/bots -w @starwards/server -w @starwards/ai
COPY tsconfig.json ./
COPY custom-typings custom-typings
COPY modules/core modules/core
COPY modules/bots modules/bots
RUN npm --prefix modules/core run build && npm --prefix modules/bots run build

# production dependencies of the four workspaces only
FROM manifests AS deps
RUN npm ci --no-audit --no-fund --omit=dev --ignore-scripts \
    -w @starwards/core -w @starwards/bots -w @starwards/server -w @starwards/ai

# what the CLIs run with that is a dev dependency: ts-node (transpile-only), the analysis store's duckdb, the training maps' fast-check
FROM ${NODE_IMAGE} AS tools
RUN npm install --prefix /opt/tools --no-audit --no-fund --no-package-lock \
    ts-node@10.9.2 typescript@6.0.3 duckdb@1.4.4 fast-check@4.8.0

FROM ${NODE_IMAGE}
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production \
    NODE_PATH=/opt/tools/node_modules \
    GIT_COMMIT=${GIT_COMMIT} \
    ARCHIVE=/training-archive
# python3 runs the archive's build_manifest.py
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=tools /opt/tools/node_modules /opt/tools/node_modules
COPY --from=deps /app/node_modules node_modules
COPY package.json tsconfig.json ./
COPY --from=build /app/modules/core/package.json modules/core/
COPY --from=build /app/modules/core/cjs modules/core/cjs
COPY --from=build /app/modules/bots/package.json modules/bots/
COPY --from=build /app/modules/bots/cjs modules/bots/cjs
COPY modules/server/package.json modules/server/tsconfig.json modules/server/
COPY modules/server/src modules/server/src
COPY modules/ai/package.json modules/ai/tsconfig.json modules/ai/
COPY modules/ai/src modules/ai/src
COPY modules/ai/crews modules/ai/crews
COPY modules/ai/brains modules/ai/brains
COPY modules/ai/curriculum modules/ai/curriculum
COPY --chmod=755 docker/training/run-job.sh /usr/local/bin/run-job
# the archive volume mounts at /training-archive: the jev answer cache resolves to /training-archive/jev-cache
RUN mkdir -p /training-archive && chown node:node /training-archive
USER node
ENTRYPOINT ["run-job"]
