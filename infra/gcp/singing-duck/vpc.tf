# Private IP for Cloud SQL and VPC connector for Cloud Run
# depends_on ensures Compute API is enabled before reading the default network
data "google_compute_network" "default" {
  name       = "default"
  depends_on = [google_project_service.compute]
}

# Allocate IP range for Private Service Access (Cloud SQL)
resource "google_compute_global_address" "private_ip_range" {
  name          = "slack-rag-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = data.google_compute_network.default.id
}

# Create private connection for Cloud SQL
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = data.google_compute_network.default.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Serverless VPC Access connector so Cloud Run can reach Cloud SQL private IP
resource "google_vpc_access_connector" "connector" {
  name          = "slack-rag-connector"
  region        = var.region
  network       = data.google_compute_network.default.name
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 3
  depends_on    = [google_project_service.vpcaccess]
}
