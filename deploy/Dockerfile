# Convoy App Dockerfile
# Copy this to your project root and customize as needed

FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; fi

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Convoy bindings (schema → server → http)
RUN npx convoy migrate --skip-db

# Build TypeScript if needed
RUN \
  if [ -f tsconfig.json ]; then \
    npx tsc --noEmit || true; \
  fi

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/convoy ./convoy
COPY --from=builder /app/package.json ./

# Convoy uses port 3000 by default
EXPOSE 3000

# Run the generated HTTP server
CMD ["node", "--import", "tsx", "convoy/_generated/http.ts"]
