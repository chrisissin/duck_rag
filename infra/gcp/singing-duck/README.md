# GCP Environment: singing-duck (Option 1 — Cloud Run)

This folder contains **Infrastructure as Code** and scripts to create the GCP environment for the Slack RAG Bot using **Architecture Option 1: Cloud Run (Serverless)** as described in [docs/GCP_ARCHITECTURE_OPTIONS.md](../../../docs/GCP_ARCHITECTURE_OPTIONS.md).

Project name: **singing-duck** (configurable via `project_id`).

**Architecture note:** The **web/Slack server** and the **MCP server** run in the **same Cloud Run service** (one container). The agent process spawns the MCP server as a child when needed. All services (agent, indexer, Ollama, DB) start or run automatically — no manual start. See [docs/CICD.md](../../../docs/CICD.md) for details.

## What Gets Created

| Component | Resource | Purpose |
|-----------|----------|---------|
| **Agent** | Cloud Run Service `slack-rag-bot` | Express + Slack Bolt app; Slack webhooks, Web UI |
| **Indexer** | Cloud Run Job `slack-rag-indexer` | Runs `sync_once.js` to sync Slack → Postgres |
| **Scheduler** | Cloud Scheduler `slack-rag-indexer-trigger` | Triggers indexer job every 5 minutes |
| **Database** | Cloud SQL for PostgreSQL | Postgres 15 + pgvector (private IP) |
| **Secrets** | Secret Manager | `slack-bot-token`, `slack-signing-secret`, `database-url` |
| **Network** | VPC connector + Private Service Access | Cloud Run → Cloud SQL over private IP |
| **Ollama** | Cloud Run Service `ollama` (optional) | LLM service; agent `OLLAMA_BASE_URL` points here when `create_ollama_service = true` |

## Prerequisites

- **gcloud** CLI installed and logged in (`gcloud auth login`)
- **Application Default Credentials** for Terraform: `gcloud auth application-default login`
- **Terraform** >= 1.0
- A **GCP project** (e.g. `singing-duck`) with **billing enabled**
- Your account must have **Owner** or **Editor** on the project (or roles: `compute.networkViewer`, `run.admin`, `secretmanager.admin`, etc.)

## 1. Create the GCP Project and Apply Terraform (one script)

From the **repository root** or from `infra/gcp/singing-duck/scripts`:

```bash
cd infra/gcp/singing-duck/scripts
chmod +x create-project-and-apply.sh

# Option A: Create project + apply (you'll be prompted to link billing if needed)
./create-project-and-apply.sh singing-duck

# Option B: With billing account (no prompt)
BILLING_ACCOUNT_ID=XXXXX-XXXXX-XXXXX ./create-project-and-apply.sh singing-duck
```

The script will:
1. Create the GCP project if it doesn’t exist
2. Link billing if `BILLING_ACCOUNT_ID` is set (or prompt you)
3. Run `terraform init`, `plan`, and `apply`

**Or** create the project and apply Terraform manually:

```bash
# Create project
gcloud projects create singing-duck --name="Singing Duck"

# Link billing (required for Cloud SQL, Cloud Run)
gcloud billing accounts list
gcloud billing projects link singing-duck --billing-account=YOUR_BILLING_ACCOUNT_ID

# Set default project
gcloud config set project singing-duck
```

## 2. Apply Terraform (if not using the script above)

From the **repository root** or from `infra/gcp/singing-duck`:

```bash
cd infra/gcp/singing-duck

# Optional: copy and edit variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars if you want a different project_id or region

# Initialize and apply
terraform init -upgrade
terraform plan -var="project_id=singing-duck"
terraform apply
```

Or use the script:

```bash
GCP_PROJECT_ID=singing-duck ./scripts/terraform-apply.sh
```

**Note:** The first apply creates the Cloud Run service and job with a placeholder image so that Terraform can create the resources. You will replace the image in step 5.

## 3. Set Slack Secrets

Replace the placeholder secret values with your real Slack app credentials:

```bash
# Slack Bot Token (starts with xoxb-)
echo -n "xoxb-your-bot-token" | ./scripts/set-secrets.sh slack-bot-token
# Slack Signing Secret (from App Credentials)
echo -n "your-signing-secret" | ./scripts/set-secrets.sh slack-signing-secret
```

Or with gcloud directly:

```bash
echo -n "xoxb-..." | gcloud secrets versions add slack-bot-token --data-file=- --project=singing-duck
echo -n "..." | gcloud secrets versions add slack-signing-secret --data-file=- --project=singing-duck
```

## 4. Enable pgvector and Create Schema

Run once to create the `vector` extension and app tables (`slack_chunks`, `slack_channel_cursors`):

```bash
./scripts/enable-pgvector.sh
```

This uses Cloud SQL Proxy + psql to:
- Create the pgvector extension
- Apply `sql/schema.sql` (creates tables)
- Grant privileges to the app user

## 5. Build and Deploy the App

From the **repository root**:

```bash
# Build container and deploy to Cloud Run (service + job)
GCP_PROJECT_ID=singing-duck ./infra/gcp/singing-duck/scripts/deploy.sh
```

This will:

1. Build the Docker image via Cloud Build and push to `gcr.io/singing-duck/slack-rag-bot`
2. Update the Cloud Run service **slack-rag-bot** with the new image
3. Update the Cloud Run job **slack-rag-indexer** with the new image

## 6. Configure Slack App

1. Open [Slack API](https://api.slack.com/apps) → your app → **Event Subscriptions**.
2. Enable Events and set **Request URL** to:
   - `https://<agent-url>/slack/events`
   - The agent URL is printed by the deploy script, or run:
     ```bash
     gcloud run services describe slack-rag-bot --region=us-central1 --format='value(status.url)'
     ```
3. Subscribe to the bot events you need (e.g. `message.channels`, `app_mention`).
4. Install the app to your workspace if not already done.

## 7. Ollama — Pull Models (Required for RAG)

When **`create_ollama_service = true`** (default), Terraform creates a Cloud Run service **ollama** and sets the agent’s `OLLAMA_BASE_URL` to it. The image is `ollama/ollama`; you can tune CPU/memory via `ollama_cpu` and `ollama_memory` in `terraform.tfvars`. **Pull both models** (required; first pull may take several minutes). Without this, RAG/Query will fail with `model "nomic-embed-text" not found`:

```bash
cd infra/gcp/singing-duck/scripts
./pull-ollama-models.sh
```

Pulls **tinyllama** (chat) and **nomic-embed-text** (embeddings for RAG).

To use an **external** Ollama (e.g. your own VM), set `create_ollama_service = false` and `ollama_base_url = "https://..."` in `terraform.tfvars`, then re-apply.

## Terraform Files Reference

| File | Purpose |
|------|---------|
| `main.tf` | Provider, project data, locals |
| `variables.tf` | Input variables (project_id, region, db_*, etc.) |
| `apis.tf` | Enable GCP APIs (Run, SQL, Secret Manager, Scheduler, VPC Access, etc.) |
| `vpc.tf` | Private IP range, Private Service Access, VPC connector |
| `cloud_sql.tf` | Cloud SQL instance, database, user, random password |
| `secrets.tf` | Secret Manager secrets (Slack tokens, database URL) |
| `iam.tf` | Service accounts and IAM bindings |
| `cloud_run.tf` | Cloud Run service (agent) |
| `cloud_run_job.tf` | Cloud Run job (indexer) |
| `scheduler.tf` | Cloud Scheduler job to trigger indexer |
| `ollama.tf` | Ollama Cloud Run service (when `create_ollama_service = true`) |
| `outputs.tf` | Outputs (URLs, connection name, next steps) |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create-project-and-apply.sh` | Create GCP project (if needed), link billing, then Terraform init + plan + apply |
| `scripts/terraform-apply.sh` | Init + plan + apply Terraform (project must already exist) |
| `scripts/deploy.sh` | Build image and update Cloud Run service + job |
| `scripts/set-secrets.sh` | Add secret version from stdin |
| `scripts/enable-pgvector.sh` | Run `CREATE EXTENSION vector` and app schema in Cloud SQL |
| `scripts/pull-ollama-models.sh` | Pull chat + embedding models on Ollama Cloud Run service |

## Cost (Approximate)

- Cloud Run: ~$20–50/month (traffic-dependent)
- Cloud SQL (db-f1-micro): ~$7/month
- Cloud Scheduler: ~$0.10/month
- Cloud Run Jobs: ~$5–10/month  
**Total: ~$32–67/month**

## Troubleshooting

- **"model nomic-embed-text not found"** or **"model tinyllama not found"** or **"retrieveContexts failed"** — Run `./scripts/pull-ollama-models.sh` to pull both models (tinyllama + nomic-embed-text). Both are required. First pull can take several minutes. See step 7.
- **"user does not have permission to access Project"** — Run `gcloud auth application-default login` and ensure your account has Owner or Editor on the project. Ensure `gcloud config set project YOUR_PROJECT_ID` matches your project.
- **"Compute Engine API has not been used... or it is disabled"** — The `create-project-and-apply.sh` script enables required APIs before Terraform. If running Terraform manually, run `gcloud services enable compute.googleapis.com run.googleapis.com vpcaccess.googleapis.com servicenetworking.googleapis.com --project=singing-duck`, wait 60s, then `terraform apply`.
- **API 403 "SERVICE_DISABLED" during apply** — APIs were enabled but hadn't propagated. Enable all APIs via gcloud (see above), wait 60–90s, then run `terraform plan -out=tfplan` and `terraform apply tfplan` again.
- **"CloudSQL doesn't support IPv6" when running enable-pgvector.sh** — The script now uses `gcloud beta sql connect` (Cloud SQL Proxy). If you still hit this, ensure the beta components are installed: `gcloud components install beta`.

## Destroying

From `infra/gcp/singing-duck`:

```bash
terraform destroy
```

Answer `yes` when prompted. This removes Cloud Run, Cloud SQL, secrets, scheduler, and related resources.
