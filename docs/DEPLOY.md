# Deployment Guide: Cockroach the Game on Unraid

This guide covers deploying the Cockroach the Game (Phaser 3 game with Express.js backend) as a Docker container on Unraid, using nginx proxy manager for domain routing.

## Prerequisites

- CLI access to your Unraid server
- Docker running on Unraid
- nginx proxy manager running on a Docker network called `proxynet`
- Domain `cockroach.wszystko.app` ready to use
- The Dockerfile exists in the repository root

## Architecture Overview

- **Express.js server** serves static game files and `/api/scores` REST API
- **SQLite database** stored at `/data/scores.db` (persistent volume mount)
- **Port 3000** exposed internally
- **nginx proxy manager** routes `cockroach.wszystko.app` to the container

## Step 1: Build the Docker Image

Choose one of these approaches:

### Option A: Build Locally and Push to Registry (Recommended for CI/CD)

Build the image on your local machine and push to a Docker registry (Docker Hub, private registry, etc.):

```bash
# Build the image
docker build -t yourusername/cockroach-game:latest .

# Push to Docker Hub (or your registry)
docker push yourusername/cockroach-game:latest
```

### Option B: Build Directly on Unraid

SSH into your Unraid server and build the image:

```bash
# SSH into Unraid
ssh root@your-unraid-ip

# Navigate to the app directory (adjust path as needed)
cd /mnt/user/appdata/cockroach-game

# Clone or sync your repository if not already present
git clone <repo-url> .

# Build the image
docker build -t cockroach-game:latest .
```

## Step 2: Create Persistent Volume Directory

SSH into your Unraid server and create the directory for the SQLite database:

```bash
ssh root@your-unraid-ip

# Create data directory (use user share for persistence)
mkdir -p /mnt/user/appdata/cockroach-game-data

# Set proper permissions
chmod 755 /mnt/user/appdata/cockroach-game-data
```

## Step 3: Run the Container on Unraid

### Using Docker CLI

Connect to Unraid via SSH and run:

```bash
docker run -d \
  --name cockroach-game \
  --network proxynet \
  -p 3000:3000 \
  -v /mnt/user/appdata/cockroach-game-data:/data \
  --restart unless-stopped \
  cockroach-game:latest
```

Or if using a remote registry:

```bash
docker run -d \
  --name cockroach-game \
  --network proxynet \
  -p 3000:3000 \
  -v /mnt/user/appdata/cockroach-game-data:/data \
  --restart unless-stopped \
  yourusername/cockroach-game:latest
```

### Using Unraid Web UI (Docker Tab)

1. Go to **Docker** tab in Unraid web interface
2. Click **Add Container**
3. Configure:
   - **Name:** `cockroach-game`
   - **Repository:** `cockroach-game:latest` (or `yourusername/cockroach-game:latest`)
   - **Network:** `proxynet` (select from dropdown)
   - **Port:** `3000:3000`
   - **Volume:**
     - Host Path: `/mnt/user/appdata/cockroach-game-data`
     - Container Path: `/data`
   - **Restart Policy:** `unless-stopped`
4. Click **Apply**

### Verify Container is Running

```bash
docker ps | grep cockroach-game
```

You should see the container listed. Check logs:

```bash
docker logs cockroach-game
```

## Step 4: Set Up nginx Proxy Manager

1. **Access nginx proxy manager** (typically at `your-unraid-ip:81`)

2. **Create a Proxy Host:**
   - Click **Proxy Hosts** > **Add Proxy Host**
   - **Domain Names:** `cockroach.wszystko.app`
   - **Scheme:** `http`
   - **Forward Hostname/IP:** `cockroach-game` (use container name since it's on same network)
   - **Forward Port:** `3000`
   - **Block Common Exploits:** Enabled
   - Click **Save**

3. **Enable SSL (Recommended):**
   - Edit the proxy host you just created
   - Go to **SSL** tab
   - **SSL Certificate:** Select `Let's Encrypt` or your preferred provider
   - **Force SSL:** Enabled
   - **HTTP/2 Support:** Enabled
   - Click **Save**

Your game is now accessible at `https://cockroach.wszystko.app`

## Step 5: Verify Deployment

### Test Game Access

1. Open browser and navigate to `https://cockroach.wszystko.app`
2. Verify the game loads and renders correctly
3. Test game functionality (controls, sounds, etc.)

### Test API Endpoint

```bash
# Test the scores API
curl https://cockroach.wszystko.app/api/scores

# You should get a JSON response (empty array initially or existing scores)
```

### Check Database

Verify the SQLite database is being created:

```bash
ls -la /mnt/user/appdata/cockroach-game-data/
```

You should see `scores.db` file being created after first API call.

## Step 6: Update Container When Code Changes

### If Building Locally

```bash
# Pull latest code
git pull origin main

# Build new image
docker build -t yourusername/cockroach-game:latest .

# Push to registry
docker push yourusername/cockroach-game:latest

# On Unraid, stop and remove old container
docker stop cockroach-game
docker rm cockroach-game

# Pull latest image
docker pull yourusername/cockroach-game:latest

# Run new container (same command as Step 3)
docker run -d \
  --name cockroach-game \
  --network proxynet \
  -p 3000:3000 \
  -v /mnt/user/appdata/cockroach-game-data:/data \
  --restart unless-stopped \
  yourusername/cockroach-game:latest
```

### If Building on Unraid

```bash
# SSH into Unraid
ssh root@your-unraid-ip

# Pull latest code
cd /mnt/user/appdata/cockroach-game
git pull origin main

# Build new image
docker build -t cockroach-game:latest .

# Stop and remove old container
docker stop cockroach-game
docker rm cockroach-game

# Run new container
docker run -d \
  --name cockroach-game \
  --network proxynet \
  -p 3000:3000 \
  -v /mnt/user/appdata/cockroach-game-data:/data \
  --restart unless-stopped \
  cockroach-game:latest
```

## Troubleshooting

### Container Won't Start

Check logs for errors:
```bash
docker logs cockroach-game
```

Common issues:
- Port 3000 already in use: Stop conflicting container or use different port
- Network `proxynet` doesn't exist: Verify nginx proxy manager is running and using `proxynet`
- Volume permissions: Ensure `/mnt/user/appdata/cockroach-game-data` has proper permissions

### Domain Not Resolving

1. Verify DNS points to your Unraid server IP
2. Check nginx proxy manager logs for errors
3. Test with IP address directly: `http://your-unraid-ip:3000`

### Database Not Persisting

1. Verify volume is mounted: `docker inspect cockroach-game | grep -A 5 Mounts`
2. Check host directory exists: `ls -la /mnt/user/appdata/cockroach-game-data/`
3. Verify container has write permissions to mounted directory

### Game Works Locally but Not via Domain

1. Verify nginx proxy manager can reach container:
   ```bash
   docker exec cockroach-game curl http://localhost:3000
   ```
2. Check nginx proxy manager logs
3. Verify firewall allows traffic to port 3000

## Backup and Recovery

### Backup Database

```bash
# On Unraid, copy the database
cp /mnt/user/appdata/cockroach-game-data/scores.db \
   /mnt/user/appdata/cockroach-game-data/scores.db.backup
```

### Restore Database

```bash
# Stop container
docker stop cockroach-game

# Restore backup
cp /mnt/user/appdata/cockroach-game-data/scores.db.backup \
   /mnt/user/appdata/cockroach-game-data/scores.db

# Start container
docker start cockroach-game
```

## Production Considerations

- **Auto-restart:** Already configured with `--restart unless-stopped`
- **Logging:** Monitor Docker logs regularly: `docker logs -f cockroach-game`
- **Updates:** Set up a cron job or use Watchtower for automatic updates
- **Backups:** Regularly backup `/mnt/user/appdata/cockroach-game-data/scores.db`
- **SSL:** Let's Encrypt certificates auto-renew through nginx proxy manager
- **Performance:** Monitor container resource usage in Unraid web UI
