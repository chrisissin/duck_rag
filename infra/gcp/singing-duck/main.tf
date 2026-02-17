terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {
  project_id = var.project_id
}

locals {
  project_number = data.google_project.project.number
  # Use placeholder until image is built; deploy script updates to gcr.io/.../slack-rag-bot
  agent_image   = var.cloud_run_agent_image != "" ? var.cloud_run_agent_image : ""
  job_image     = var.cloud_run_job_image != "" ? var.cloud_run_job_image : local.agent_image
  # Agent OLLAMA_BASE_URL: use managed Ollama service, or var, or fallback
  ollama_base_url = var.create_ollama_service ? google_cloud_run_v2_service.ollama[0].uri : (var.ollama_base_url != "" ? var.ollama_base_url : "http://localhost:11434")
}
