# Slack RAG Bot — Cloud Run (Option 1: singing-duck)
FROM node:20-slim

WORKDIR /app

# Install gcloud CLI for MCP server (GCP automation); SDK install script needs python
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/opt \
    && ln -sf /opt/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8080
ENV PORT=8080

CMD ["node", "src/start.js"]
