#!/usr/bin/env bash
# Initialize and apply Terraform for singing-duck (Option 1: Cloud Run).
# Run from repo root or from infra/gcp/singing-duck.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$TF_DIR"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo singing-duck-boso)}"

echo "Using project_id: $PROJECT_ID"
echo "Terraform dir: $TF_DIR"

# Create project if it doesn't exist (optional; requires billing)
if ! gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  echo "Create the GCP project first: gcloud projects create $PROJECT_ID --name=\"Singing Duck\""
  echo "Link billing: gcloud billing accounts list && gcloud billing projects link $PROJECT_ID --billing-account=ACCOUNT_ID"
  exit 1
fi

gcloud config set project "$PROJECT_ID"

terraform init -upgrade
terraform plan -var="project_id=$PROJECT_ID" -out=tfplan
terraform apply tfplan

echo ""
echo "Next: update Slack secrets, enable pgvector, then run scripts/deploy.sh"
