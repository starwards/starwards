FROM node:22-alpine

# O-S-C is not on npm. Download the pure-Node release asset and extract it.
# Pin version here; update docs/DEPENDENCIES.md when bumping.
ARG OSC_VERSION=1.30.4
RUN wget -q "https://openstagecontrol.ammd.net/packages/open-stage-control_${OSC_VERSION}_node.zip" \
    -O /tmp/osc.zip \
    && unzip -q /tmp/osc.zip -d /opt \
    && mv "/opt/open-stage-control_${OSC_VERSION}_node" /opt/open-stage-control \
    && rm /tmp/osc.zip \
    && mkdir -p /root/.config

WORKDIR /opt/open-stage-control

EXPOSE 8080
EXPOSE 57120/udp

# --port: HTTP server port tablets connect to
# --osc-port: UDP port to receive OSC messages from tablets
# --send: default targets — widget interactions are sent to Node-RED's udp-in
# --custom-module: per-client session routing + subscription bootstrap
# --remote-root: root the in-app file browser at the mounted sessions dir
CMD ["node", "index.js", \
     "--port", "8080", \
     "--osc-port", "57120", \
     "--send", "node-red:57120", \
     "--custom-module", "/modules/starwards-bridge.js", \
     "--remote-root", "/sessions"]
