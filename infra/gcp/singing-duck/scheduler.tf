# Cloud Scheduler: trigger indexer job every 5 minutes
resource "google_cloud_scheduler_job" "indexer" {
  name             = "slack-rag-indexer-trigger"
  region           = var.region
  schedule         = var.indexer_schedule
  time_zone        = "UTC"
  attempt_deadline = "600s"
  depends_on       = [google_project_service.scheduler]

  retry_config {
    retry_count = 2
  }

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.indexer.name}:run"
    oauth_token {
      service_account_email = "${local.project_number}-compute@developer.gserviceaccount.com"
    }
  }
}

output "scheduler_job_name" {
  value       = google_cloud_scheduler_job.indexer.name
  description = "Cloud Scheduler job name"
}
