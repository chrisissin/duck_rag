export function decide(parsed) {
  if (parsed.instance_name?.startsWith("-")) {
    return { decision: "AUTO_REPLACE" };
  }
  return { decision: "NEEDS_APPROVAL" };
}
