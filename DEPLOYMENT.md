# Deployment Guide

## Docker Deployment

The project includes Docker configuration for containerized deployment with PostgreSQL.

### Configuration Model (YAML vs ENV)

Use both, with strict separation:

- Compose YAML defines service wiring and infrastructure shape.
   - services, images/build, ports, volumes, healthchecks, restart policy
- Environment variables provide deploy-time values.
   - passwords, API keys, auth secrets, per-environment host/port values

Production guidance:

- Keep Compose YAML in git.
- Do not commit secret values.
- Store production values in an env file on the host (for example `.env.prod`) or inject them from your secret manager.
- Prefer immutable image tags (for example `sha-<commit>`) in production over `latest`.

Recommended file pattern:

- `docker-compose.yml`: base services
- `docker-compose.prod.yml`: production overrides
- `.env.prod`: production values on host only (not committed)

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Bash shell (Linux/macOS) or WSL2 (Windows)

### Quick Start

1. **Create environment configuration:**

   ```bash
   cp .env.example .env
   ```

2. **Generate secure passwords and keys:**

   ```bash
   # Generate bcrypt hash for admin password
   npm run admin:hash -- your-secure-password
   
   # Generate random API key and auth secret (use openssl or similar)
   openssl rand -base64 32
   ```

3. **Update `.env` with the generated values:**

   ```env
   POSTGRES_PASSWORD=<your-secure-db-password>
   INGEST_API_KEY=<your-api-key-min-16-chars>
   AUTH_SECRET=<your-secret-key-min-16-chars>
   ADMIN_PASSWORD_HASH=<bcrypt-hash-from-npm-run-admin-hash>
   ```

4. **Deploy:**

   ```bash
   npm run deploy
   ```

   Or manually:

   ```bash
   docker-compose up -d
   docker-compose exec hub npm run db:migrate
   ```

   Production-style command pattern:

   ```bash
   docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
   docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml exec hub npm run db:migrate
   ```

### Accessing the Hub

- **Dashboard:** http://localhost:3000/admin
- **API Health:** http://localhost:3000/api/health
- **Ingest Endpoint:** http://localhost:3000/api/v1/usage-events

### Commands

```bash
# Build Docker image
npm run docker:build

# Start services
npm run docker:up

# Stop services
npm run docker:down

# View hub logs
npm run docker:logs

# View all logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop and remove all containers/volumes
docker-compose down -v
```

### Plugin Configuration

Configure the plugin mirror in OpenClaw's `openclaw.json`:

```json
{
  "plugins": {
    "token-usage-ledger": {
      "mirror": {
        "enabled": true,
        "url": "http://your-host:3000/api/v1/usage-events",
        "apiKey": "<value-of-INGEST_API_KEY-from-.env>",
        "timeoutMs": 5000
      }
    }
  }
}
```

### Database Backups

To backup the PostgreSQL database:

```bash
docker-compose exec postgres pg_dump -U openclaw openclaw_usage > backup_$(date +%Y%m%d_%H%M%S).sql
```

To restore from backup:

```bash
docker-compose exec -T postgres psql -U openclaw openclaw_usage < backup_20260629_120000.sql
```

### Production Considerations

- Change all default passwords in `.env`
- Use strong, randomly generated values for `INGEST_API_KEY` and `AUTH_SECRET`
- Store `.env` securely (don't commit to git)
- Prefer `.env.prod` with `--env-file` on production hosts
- Use SSL/TLS reverse proxy (nginx/traefik) for production
- Configure proper database backups
- Monitor logs for errors: `docker-compose logs hub`
- Set resource limits in docker-compose.yml
- Use managed PostgreSQL service (AWS RDS, Google Cloud SQL, etc.) for production

### Troubleshooting

**Hub won't start:**
```bash
docker-compose logs hub
```

**Database connection issues:**
```bash
docker-compose exec postgres psql -U openclaw -d openclaw_usage -c "SELECT NOW();"
```

**Check service health:**
```bash
docker-compose exec hub wget --spider http://localhost:3000/api/health
```

**Rebuild and restart:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Manual Deployment

For non-Docker deployments:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up PostgreSQL database** (external instance)

3. **Configure environment variables** in `.env`

4. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

5. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

The app runs on port 3000 by default. Use a reverse proxy (nginx, Apache) to serve over HTTPS.
