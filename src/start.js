/**
 * Entry point for server: load secrets from Secret Manager first (Cloud Run fallback),
 * then start the app. Use this instead of server.js when Cloud Run doesn't inject env from secrets.
 */
import { ensureSecrets } from "./db/ensureSecrets.js";

await ensureSecrets();
await import("./server.js");
