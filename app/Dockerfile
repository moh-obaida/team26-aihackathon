# Jeran: one container serves the built app and the API. Node 24 is required for the built-in node:sqlite.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DB_PATH=/data/team26.db \
    SECURE_COOKIES=1 TRUST_PROXY=1 DEMO=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/auth/me').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
