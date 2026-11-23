FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STORAGE_DRIVER=local STORAGE_DIR=/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/node_modules/@fontsource/inter/files ./node_modules/@fontsource/inter/files
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "server.js"]
