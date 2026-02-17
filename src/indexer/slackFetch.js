/**
 * Slack fetch helpers with basic rate-limit handling.
 */
import { withSlackRetry } from "../slack/retry.js";

export { withSlackRetry };

export async function listAllPublicChannels(web) {
  let cursor = undefined;
  const channels = [];
  while (true) {
    const res = await withSlackRetry(() => web.conversations.list({
      limit: 200,
      cursor,
      types: "public_channel",
      exclude_archived: true
    }), { operation: "conversations.list" });
    if (res?.channels?.length) channels.push(...res.channels);
    cursor = res?.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  // Only channels bot is a member of
  return channels.filter(c => c?.is_member);
}

export async function fetchHistory(web, channel, { oldest, limit = 200 }) {
  let cursor = undefined;
  const all = [];
  while (true) {
    const res = await withSlackRetry(() => web.conversations.history({
      channel,
      limit,
      cursor,
      oldest
    }), { operation: "conversations.history" });
    if (res?.messages?.length) all.push(...res.messages);
    cursor = res?.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  // Slack returns newest->oldest; reverse to oldest->newest
  return all.reverse();
}

export async function fetchThreadReplies(web, channel, thread_ts, { limit = 200 }) {
  const res = await withSlackRetry(() => web.conversations.replies({
    channel,
    ts: thread_ts,
    limit
  }), { operation: "conversations.replies" });
  // replies returns oldest->newest
  return res?.messages || [];
}
