FROM mcr.microsoft.com/playwright:focal

WORKDIR /work
COPY . ./
RUN npm ci
RUN npm run build:model
CMD [ "npm", "run", "test:e2e", "--", "--update-snapshots" ]