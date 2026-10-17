FROM node:24-bookworm AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
# postbuild runs automatically: post-build.js bundles the server into dist/app and stages dist/static

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist/ ./
ENV PORT=80
EXPOSE 80
CMD ["node", "app/starwards.cjs"]
