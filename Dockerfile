FROM node:24-bookworm AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
# postbuild runs automatically: modules pack → post-build.js assembles dist/
RUN cd dist && npm install --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist/ ./
ENV PORT=80
EXPOSE 80
CMD ["node", "node_modules/@starwards/server/cjs/prod.js"]
