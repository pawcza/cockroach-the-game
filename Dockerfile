FROM node:24-alpine AS build

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npx tsc -p server/tsconfig.json
RUN npm prune --omit=dev

FROM node:24-alpine

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/scores.db

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
