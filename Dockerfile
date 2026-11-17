# Quorum: one container serving the built client and the /api routes.
# Study data (participants, events, snapshots) goes to /data, which fly.toml mounts as a volume.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    STUDY_DATA_DIR=/data \
    QUORUM_WORKBENCH=off
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/server/study/floors ./server/study/floors
EXPOSE 8080
CMD ["node", "dist-server/index.mjs"]
