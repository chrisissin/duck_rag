#!/usr/bin/env bash
# Enable pgvector in the Cloud SQL database (run once after Terraform apply).
# Uses Cloud SQL Proxy + psql (avoids gcloud sql connect password prompt + IPv6 issues).
set -e

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo singing-duck-boso)}"
INSTANCE="${CLOUD_SQL_INSTANCE:-slack-rag-db}"
DB_NAME="${DB_NAME:-slack_rag}"
DB_APP_USER="${DB_APP_USER:-slack_rag_app}"
LOCAL_PORT="${LOCAL_PORT:-15432}"

# Ensure cloud_sql_proxy component
echo "Ensuring gcloud components (cloud_sql_proxy)..."
gcloud components install cloud_sql_proxy --quiet

SDK_ROOT=$(gcloud info --format='value(installation.sdk_root)' 2>/dev/null)
[[ -n "$SDK_ROOT" ]] && export PATH="$SDK_ROOT/bin:$PATH"
if ! command -v cloud_sql_proxy &>/dev/null; then
  echo "Cloud SQL Proxy not found. Run: gcloud components install cloud_sql_proxy"
  exit 1
fi
if ! command -v psql &>/dev/null; then
  echo "psql not found. Install: brew install libpq && export PATH=\"\$(brew --prefix libpq)/bin:\$PATH\""
  exit 1
fi

# Get password from Secret Manager (postgres user; Terraform creates this secret)
echo "Fetching postgres password from Secret Manager..."
PGPASSWORD=$(gcloud secrets versions access latest --secret=postgres-password --project="$PROJECT_ID")
CONNECTION_NAME=$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')

echo "Starting Cloud SQL Proxy on port $LOCAL_PORT..."
cloud_sql_proxy -instances="$CONNECTION_NAME"=tcp:"$LOCAL_PORT" &
PROXY_PID=$!
trap "kill $PROXY_PID 2>/dev/null || true" EXIT
sleep 3

echo "Enabling pgvector extension..."
PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -p "$LOCAL_PORT" -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
echo "pgvector extension enabled."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/../../../sql/schema.sql"
if [[ -f "$SCHEMA_FILE" ]]; then
  echo "Creating app tables (slack_chunks, slack_channel_cursors)..."
  PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -p "$LOCAL_PORT" -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"
  echo "Granting privileges to $DB_APP_USER..."
  PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -p "$LOCAL_PORT" -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT CREATE ON SCHEMA public TO \"$DB_APP_USER\"; GRANT USAGE ON SCHEMA public TO \"$DB_APP_USER\"; GRANT ALL ON ALL TABLES IN SCHEMA public TO \"$DB_APP_USER\"; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO \"$DB_APP_USER\";"
  echo "Schema applied."
else
  echo "Warning: $SCHEMA_FILE not found. Run manually: psql ... -f sql/schema.sql"
fi
