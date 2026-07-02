This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Docker Deploy

Use Docker Compose to deploy the Hub and PostgreSQL together on Linux or macOS.

Note: most current Docker installs use `docker compose`. If your system provides the legacy standalone binary, replace `docker compose` with `docker-compose` in the commands below.

### 1) Prepare environment

```bash
cat > .env <<'EOF'
POSTGRES_DB=openclaw_usage
POSTGRES_USER=openclaw
POSTGRES_PASSWORD=your-secure-db-password
INGEST_API_KEY=your-random-api-key-min-16-chars
AUTH_SECRET=your-random-secret-min-16-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=replace-with-bcrypt-hash
COOKIE_SECURE=true
NEXT_PUBLIC_APP_NAME=OpenClaw Usage Hub
EOF
```

Generate admin password hash:

```bash
npm run admin:hash -- your-secure-password
```

Update `.env` with the generated hash and your real secrets:

- `POSTGRES_PASSWORD`
- `INGEST_API_KEY`
- `AUTH_SECRET`
- `ADMIN_PASSWORD_HASH`

If you access the hub over plain `http://` on a LAN (no TLS), set `COOKIE_SECURE=false` so browsers accept the auth cookie.

### 2) Deploy

```bash
npm run deploy
```

Or run commands manually:

```bash
docker compose build
docker compose up -d
docker compose exec hub npm run db:migrate
```

### 3) Verify

```bash
curl http://localhost:3000/api/health
```

Admin dashboard:

```text
http://localhost:3000/admin
```

### Useful Docker commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Restart services
docker compose restart

# Tail logs
docker compose logs -f

# Tail hub logs only
docker compose logs -f hub

# Rebuild image without cache
docker compose build --no-cache

# Stop and remove containers + volumes
docker compose down -v
```

### Deploy from pre-built GHCR image

If the published image is not available for your Mac architecture, fall back to local build with `docker compose build`.

```bash
docker pull ghcr.io/lazytalk/openclaw-usage-hub:latest
docker compose up -d
```

For stage/production, use env-driven parameters and run migration after startup:

```bash
docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml exec hub npm run db:migrate
```

Recommended production pattern:

- Keep deployment structure in Compose YAML.
- Keep deploy-time values and secrets in host env files or secret manager.
- Prefer immutable image tags in production (for example `sha-<commit>`) instead of `latest`.

For full deployment details, see `DEPLOYMENT.md` and `DEPLOYMENT-CI-CD.md`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
