# CI/CD and deployment

## Pipeline overview

- **Workflow:** [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)
- **CI (every push/PR):** `npm ci`, `npm ls` — validates install.
- **Deploy (push to `main` or manual):** Authenticate to GCP → Cloud Build image → update Cloud Run **service** (agent) and **job** (indexer).

## One container: web server + MCP server

The **web server** (Express + Slack Bolt in `src/server.js`) and the **MCP server** (`src/services/automation/gcpMcpServer.js`) run in the **same Cloud Run service**, in the **same container**:

- The container runs a single process: `node src/server.js`.
- When the app needs to call GCP automation (e.g. scale-up, scale PR script), the MCP **client** inside the agent spawns the MCP **server** as a **child process** (`node gcpMcpServer.js`) over stdio. There is no separate Cloud Run service for MCP.

So one Cloud Run service handles:

- Slack events and slash commands
- Web UI (`/`, `/api/analyze`)
- MCP tools (by starting the MCP server process on demand)

## Do all required services start automatically?

Yes. You don’t start anything by hand:

| Component | How it runs |
|-----------|--------------|
| **Agent (web + MCP)** | Cloud Run **service**. Starts when the first HTTP request hits it (e.g. from Slack). Scales to zero when idle. |
| **Indexer** | Cloud Run **job**. Runs when **Cloud Scheduler** triggers it (e.g. every 5 minutes). No manual start. |
| **Ollama** | Cloud Run **service** (if you created it with Terraform). Starts on first request; scales to zero when idle. |
| **Cloud SQL** | Always on (managed). No action needed. |

So: agent and Ollama start on demand; the indexer runs on a schedule; the database is always available.

## Setting up CI/CD (GitHub Actions)

### 1. Service account for deploy

Create a GCP service account (or use an existing one) with:

- `roles/run.admin` — update Cloud Run service and job
- `roles/cloudbuild.builds.builder` — run Cloud Build (build the image)
- `roles/iam.serviceAccountUser` — act as the Cloud Run service account (so the new revision can run)

Create a JSON key and add it as a **repository secret** in GitHub:

- **Settings → Secrets and variables → Actions → New repository secret**
- Name: `GCP_SA_KEY`
- Value: contents of the JSON key file

### 2. Optional: repository variables

Under **Settings → Secrets and variables → Actions → Variables** you can set:

- `GCP_PROJECT_ID` (e.g. `singing-duck`)
- `GCP_REGION` (e.g. `us-central1`)

If you don’t set them, the workflow uses defaults: `singing-duck`, `us-central1`. You can also override them when running the workflow manually (**Actions → Build and Deploy → Run workflow**).

### 3. Behavior

- **Push to `main`:** CI runs, then build + deploy to Cloud Run (service + job).
- **Pull request:** Only CI runs (no deploy).
- **Manual run:** **Actions → Build and Deploy → Run workflow** — you can pass `project_id` and `region` in the inputs.

## Alternative: Workload Identity Federation

Instead of a JSON key you can use [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) so GitHub Actions authenticates without a long-lived secret. Setup is more involved; the workflow can be adapted to use `google-github-actions/auth` with `workload_identity_provider` and `service_account` instead of `credentials_json`.
