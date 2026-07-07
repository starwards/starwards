FROM node:22-alpine

# O-S-C is not on npm. Download the pure-Node release asset and extract it.
# Pin version here; update docs/DEPENDENCIES.md when bumping.
ARG OSC_VERSION=1.30.3
RUN wget -q "https://github.com/jean-emmanuel/open-stage-control/releases/download/v${OSC_VERSION}/open-stage-control-${OSC_VERSION}-node.zip" \
    -O /tmp/osc.zip \
    && unzip -q /tmp/osc.zip -d /opt \
    && mv "/opt/open-stage-control-${OSC_VERSION}-node" /opt/open-stage-control \
    && rm /tmp/osc.zip

WORKDIR /opt/open-stage-control

EXPOSE 8080
EXPOSE 57120/udp

# --no-gui: headless (pure-Node; no Electron/xvfb needed)
# --port: HTTP server port tablets connect to
# --osc-port: UDP port to receive OSC messages from tablets
# --load: default session loaded for clients that don't get a per-client session from the module
# --custom-module: per-client session routing + subscription bootstrap
CMD ["node", "open-stage-control", "--no-gui", \
     "--port", "8080", \
     "--osc-port", "57120", \
     "--custom-module", "/modules/starwards-bridge.js"]
