#!/bin/bash
set -e

cd "$(dirname "$0")"

git pull
docker stop cockroach-game 2>/dev/null || true
docker rm cockroach-game 2>/dev/null || true
docker build --no-cache -t cockroach-the-game .
docker run -d \
  --name cockroach-game \
  --network proxynet \
  -v /mnt/user/appdata/cockroach-game-data:/data \
  cockroach-the-game

echo "Deployed successfully!"
