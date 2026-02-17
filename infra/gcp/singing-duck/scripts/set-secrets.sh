#!/usr/bin/env bash
# Store Slack token and signing secret in Secret Manager (singing-duck).
# Usage:
#   echo -n "xoxb-your-token" | ./set-secrets.sh slack-bot-token
#   echo -n "your-signing-secret" | ./set-secrets.sh slack-signing-secret
set -e

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo singing-duck-boso)}"
SECRET_ID="${1:?Usage: $0 <secret-id> (e.g. slack-bot-token or slack-signing-secret)}"

gcloud secrets versions add "$SECRET_ID" \
  --data-file=- \
  --project "$PROJECT_ID"

echo "Added new version to secret: $SECRET_ID"
