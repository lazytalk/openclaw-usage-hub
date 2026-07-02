# CI/CD Deployment Guide (GitHub Actions)

This guide explains how to automatically build and deploy Docker images using GitHub Actions.

## What Happens Automatically

1. **You push code to GitHub** → Triggers workflow
2. **GitHub Actions builds Docker image** → Runs Dockerfile
3. **Image is pushed to GitHub Container Registry (GHCR)** → Available for deployment
4. **On your server, pull and run the image** → No building needed

## Prerequisites

- Repository is on GitHub (✓ you have this)
- GitHub Actions is enabled (default, enabled by default)
- A server with Docker installed

## Setup (One-Time)

No setup needed! The workflow file (`.github/workflows/docker-build.yml`) is already in the repo. It automatically:

- Builds on every push to `main` branch
- Pushes to **GitHub Container Registry (GHCR)** using your GitHub token
- Tags images with branch name, SHA hash, and `latest`

## Deployment on Server

Once you push code, the image is automatically available. On your server:

### Step 1: Create `.env` file with production values
```bash
mkdir openclaw-usage-hub
cd openclaw-usage-hub
cat > .env << 'EOF'
POSTGRES_DB=openclaw_usage
POSTGRES_USER=openclaw
POSTGRES_PASSWORD=your-secure-password-here
INGEST_API_KEY=your-random-api-key-min-16-chars
AUTH_SECRET=your-random-secret-min-16-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=your-bcrypt-hash
COOKIE_SECURE=true
NEXT_PUBLIC_APP_NAME=OpenClaw Usage Hub
EOF
```

### Step 2: Pull and run the latest Docker image
```bash
docker run -d \
  --name openclaw-postgres \
  -e POSTGRES_DB=$POSTGRES_DB \
  -e POSTGRES_USER=$POSTGRES_USER \
  -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  -v postgres_data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine

docker run -d \
  --name openclaw-hub \
  --link openclaw-postgres \
  -e DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@openclaw-postgres:5432/$POSTGRES_DB" \
  -e INGEST_API_KEY=$INGEST_API_KEY \
  -e AUTH_SECRET=$AUTH_SECRET \
  -e ADMIN_USERNAME=$ADMIN_USERNAME \
  -e ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH \
  -e NEXT_PUBLIC_APP_NAME="$NEXT_PUBLIC_APP_NAME" \
  -p 3000:3000 \
  ghcr.io/lazytalk/openclaw-usage-hub:latest
```

Or use `docker-compose.yml` with pre-built image:

```bash
# Download docker-compose.yml from repo
curl -o docker-compose.yml https://raw.githubusercontent.com/lazytalk/openclaw-usage-hub/main/docker-compose.yml

# Create .env file as above
# Then run:
docker-compose up -d
```

## Image Tags

Images are automatically tagged with:

| Tag | Description | When |
|-----|-------------|------|
| `latest` | Latest version of main branch | Every push to main |
| `sha-abc1234` | Git commit hash | Every push |
| `main` | Current main branch version | Every push |

You can pull any version:
```bash
# Latest version
docker pull ghcr.io/lazytalk/openclaw-usage-hub:latest

# Specific commit
docker pull ghcr.io/lazytalk/openclaw-usage-hub:sha-abc1234

# Latest from main branch
docker pull ghcr.io/lazytalk/openclaw-usage-hub:main
```

## Workflow Details

The GitHub Actions workflow (`.github/workflows/docker-build.yml`):

1. **Triggers on:**
   - Push to `main` branch
   - Changes to: src/, db/, scripts/, package.json, Dockerfile, docker-compose.yml
   - Manual trigger (workflow_dispatch)

2. **Does:**
   - Checks out code
   - Sets up Docker Buildx (advanced build features)
   - Logs into GitHub Container Registry (auto-authenticated)
   - Builds Docker image
   - Pushes to ghcr.io/lazytalk/openclaw-usage-hub
   - Caches build layers (faster subsequent builds)

3. **Output:**
   - Image available at: `ghcr.io/lazytalk/openclaw-usage-hub:latest`
   - All pushes → Build + Push (takes ~2-3 minutes)
   - View build logs in GitHub Actions tab

## Viewing Build Status

1. Go to: https://github.com/lazytalk/openclaw-usage-hub/actions
2. See all workflow runs
3. Click on a run to see logs
4. Green ✓ = Success, Red ✗ = Failed

## Deployment Steps Summary

```bash
# 1. On your server, create .env file with your values
cp .env.example .env
nano .env

# 2. Pull the latest Docker image (built by GitHub Actions)
docker pull ghcr.io/lazytalk/openclaw-usage-hub:latest

# 3. Run using docker-compose (or docker run commands above)
docker-compose up -d

# 4. Check it's working
curl http://localhost:3000/api/health
```

## Advantages

✅ **No building on server** — Just pull pre-built image  
✅ **Consistent builds** — Same build environment every time  
✅ **Fast deployment** — Skip build step (2-3 min saved)  
✅ **Automatic** — Triggers on every push  
✅ **Free** — GitHub Actions free tier included  
✅ **Version control** — Can pull any previous version by commit hash  

## Troubleshooting

**Build failed:**
- Check https://github.com/lazytalk/openclaw-usage-hub/actions
- See error in workflow logs
- Common issues: environment variables, Dockerfile syntax

**Image pull fails (404):**
- Verify image is built: Check Actions tab
- Use `docker pull --all-tags ghcr.io/lazytalk/openclaw-usage-hub` to see available tags

**Container won't start:**
- Check logs: `docker logs openclaw-hub`
- Verify `.env` variables are correct
- Check database is running: `docker logs openclaw-postgres`

## Additional Configuration

### Private Docker Registry (instead of GHCR)

To push to Docker Hub instead:

1. Create Docker Hub account
2. Add secrets in GitHub repo settings:
   - `DOCKER_USERNAME`
   - `DOCKER_PASSWORD`
3. Update `.github/workflows/docker-build.yml`:
   ```yaml
   registry: docker.io
   username: ${{ secrets.DOCKER_USERNAME }}
   password: ${{ secrets.DOCKER_PASSWORD }}
   IMAGE_NAME: your-username/openclaw-usage-hub
   ```

### Manual Workflow Trigger

You can manually trigger the build without pushing:
1. Go to Actions tab
2. Click "Build and Push Docker Image"
3. Click "Run workflow"

## Next Steps

1. Make a test push to GitHub to trigger the first build
2. Wait 2-3 minutes for build to complete
3. Deploy image on your server using steps above
4. Configure plugin mirror to point to your server

Done! Auto-deployment is now active.
