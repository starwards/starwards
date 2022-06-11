FROM mcr.microsoft.com/playwright:v1.22.2

WORKDIR /work
COPY . ./
RUN npm ci
RUN npm run build:model
RUN npm run build:server
CMD [ "npm", "run", "test:e2e", "--", "--update-snapshots" ]