FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /work
COPY . ./
RUN npm ci
RUN npm run build:core
RUN npm run build:server
# the e2e server serves modules/browser/dist; without this the image tests whatever dist the host had
RUN rm -rf modules/browser/dist && npm --prefix modules/browser run build
CMD [ "npm", "run", "test:e2e", "--", "--update-snapshots" ]