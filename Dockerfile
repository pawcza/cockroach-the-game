FROM node:20-alpine

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Build server
RUN npx tsc -p server/tsconfig.json

# Create data directory for SQLite
RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/scores.db

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
