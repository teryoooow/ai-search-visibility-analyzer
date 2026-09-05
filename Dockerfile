# Self-contained build: Node + headless Chromium so the analyzer runs anywhere
# Docker exists — no Node or Chrome install needed on the host.
#
#   docker build -t visibility-analyzer .
#   docker run -p 3100:3100 visibility-analyzer
#   → open http://localhost:3100

FROM node:22-bookworm-slim

# Chromium (headless rendering + Lighthouse) and fonts so pages render correctly
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3100

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

EXPOSE 3100

# GEO LLM analysis (main GEO function, runs on every analysis once keyed;
# any OpenAI-compatible endpoint):
#   docker run -p 3100:3100 -e GEO_LLM_API_KEY=sk-... -e GEO_LLM_BASE_URL=https://api.openai.com/v1 visibility-analyzer

CMD ["node", "server.js"]
