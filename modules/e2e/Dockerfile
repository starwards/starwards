FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /work
COPY . ./
RUN npm ci
RUN npm run build:core
RUN npm run build:server
CMD [ "npm", "run", "test:e2e", "--", "--update-snapshots" ]