export function formatReport({ parsed, decision }) {
  return {
    parsed,
    decision,
    summary: decision.decision === "AUTO_REPLACE"
      ? `gcloud compute instance-groups managed recreate-instances <MIG> --instances=${parsed.instance_name} --zone=<ZONE> --project=${parsed.project_id}`
      : "Approval required"
  };
}
