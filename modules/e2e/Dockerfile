FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /work
COPY . ./
RUN npm ci
RUN npm run build:core
RUN npm run build:server
# Both projects keep their own baselines, so both have to be regenerated here — Test-Visual gates on
# the chromium-headed set.
CMD [ "sh", "-c", "npm run test:e2e -- --update-snapshots && xvfb-run npm run test:widgets -- --update-snapshots" ]