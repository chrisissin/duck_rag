# GCP project and region for singing-duck (Option 1: Cloud Run)
variable "project_id" {
  type        = string
  description = "GCP project ID (e.g. singing-duck-boso)"
  default     = "singing-duck-boso"
}

variable "region" {
  type        = string
  description = "Region for Cloud Run, Cloud SQL, and scheduler"
  default     = "us-central1"
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL instance tier"
  default     = "db-f1-micro"
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database name"
  default     = "slack_rag"
}

variable "db_user" {
  type        = string
  description = "PostgreSQL user name (password stored in Secret Manager)"
  default     = "slack_rag_app"
}

variable "indexer_schedule" {
  type        = string
  description = "Cron schedule for indexer job (e.g. every 30 min; avoid overlaps with job timeout)"
  default     = "*/30 * * * *"
}

variable "cloud_run_agent_image" {
  type        = string
  description = "Container image for the agent (e.g. gcr.io/singing-duck/slack-rag-bot)"
  default     = ""
}

variable "cloud_run_job_image" {
  type        = string
  description = "Container image for the indexer job (usually same as agent)"
  default     = ""
}

variable "ollama_base_url" {
  type        = string
  description = "Ollama service URL (Cloud Run URL or VM internal URL). Leave empty to set after deploy."
  default     = ""
}

variable "create_ollama_service" {
  type        = bool
  description = "Create Ollama as a Cloud Run service and set agent OLLAMA_BASE_URL to it"
  default     = true
}

variable "ollama_image" {
  type        = string
  description = "Container image for Ollama (e.g. ollama/ollama)"
  default     = "ollama/ollama"
}

variable "ollama_cpu" {
  type        = string
  description = "CPU allocation for Ollama service (e.g. 2 or 4 for faster inference)"
  default     = "4"
}

variable "ollama_memory" {
  type        = string
  description = "Memory for Ollama service (e.g. 4Gi or 8Gi)"
  default     = "4Gi"
}
