FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /work
COPY . ./
RUN npm ci
RUN npm run build:core
RUN npm run build:server
CMD [ "npm", "run", "test:e2e", "--", "--update-snapshots" ]