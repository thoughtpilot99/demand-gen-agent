# Zero-Node path: `docker compose up` and the agent is live in Slack.
FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching. tsx (a dev dep) runs the app, so we keep
# all dependencies.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Runs `tsx src/index.ts` to boot Slack + the scheduled jobs.
CMD ["npm", "start"]
