# Deploying Convoy Apps

This guide covers deploying your Convoy application to production.

## Quick Start

Copy the files from `deploy/` to your project root:

```bash
cp node_modules/@avvos/convoy/deploy/* .
```

---

## Option 1: Docker Compose (Self-Hosted)

Best for: VPS, on-premise, Coolify, CapRover

```bash
# Start Postgres + your app
docker-compose up -d

# View logs
docker-compose logs -f app
```

Your app will be at `http://localhost:3000`.

### Environment Variables

| Variable       | Required | Default   | Description                  |
| -------------- | -------- | --------- | ---------------------------- |
| `DATABASE_URL` | Yes      | —         | PostgreSQL connection string |
| `PORT`         | No       | `3000`    | Server port                  |
| `HOST`         | No       | `0.0.0.0` | Bind address                 |

---

## Option 2: Railway

Best for: Zero-config cloud hosting

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a PostgreSQL plugin
4. Set environment variables:
   - `DATABASE_URL` → Copy from Postgres plugin

Railway auto-detects the `railway.toml` and builds from Dockerfile.

---

## Option 3: Fly.io

Best for: Edge deployment, global CDN

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch (creates fly.toml)
fly launch

# Add Postgres
fly postgres create
fly postgres attach <your-db-name>

# Deploy
fly deploy
```

---

## Option 4: Manual (Node.js)

```bash
# Install dependencies
npm install

# Generate Convoy bindings
npx convoy migrate

# Start server
node --import tsx convoy/_generated/http.ts
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use a managed Postgres (Neon, Supabase, Railway Postgres)
- [ ] Configure connection pooling for high traffic
- [ ] Set up logging/monitoring (optional: `CONVOY_DEBUG=1` for verbose logs)
- [ ] Use HTTPS (reverse proxy or platform-provided)

---

## Troubleshooting

### `DATABASE_URL is missing`

Ensure the environment variable is set. Check your `.env` file or platform settings.

### `Transaction not supported`

Your database driver doesn't support transactions. Use `drizzle-orm/node-postgres` (default).

### Connection refused

Check that Postgres is running and accessible from your app container. In Docker Compose, use `db` as the hostname, not `localhost`.
