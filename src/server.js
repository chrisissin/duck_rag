import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import pkg from "@slack/bolt";
const { App, ExpressReceiver } = pkg;
import { processIncomingMessage } from "./orchestrator.js";
import { UserResolver } from "./slack/userResolver.js";
import { normalizeSlackText } from "./slack/normalize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate signing secret is set
if (!process.env.SLACK_SIGNING_SECRET) {
  console.error('❌ ERROR: SLACK_SIGNING_SECRET is not set in .env file');
  console.error('   Get it from: Slack App → Basic Information → App Credentials → Signing Secret');
  process.exit(1);
}

// Initialize Receiver to handle both Slack Events and Express Routes
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET.trim(),
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

// Handle unhandled promise rejections (e.g., invalid_auth during startup)
process.on('unhandledRejection', (error) => {
  if (error.code === 'slack_webapi_platform_error' && error.data?.error === 'invalid_auth') {
    // Suppress invalid_auth errors - expected with placeholder credentials
    return;
  }
  console.error('Unhandled promise rejection:', error);
});

// --- WEB INTERFACE ROUTES ---
receiver.app.use(express.json());
receiver.app.use(express.static(path.join(__dirname, "web")));

receiver.app.post("/api/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    const timestamp = new Date().toISOString();
    const queryPreview = text?.length > 100 ? text.substring(0, 100) + "..." : text;
    console.log(`[${timestamp}] 📥 Query received from Web UI: "${queryPreview}"`);
    
    // Map Web UI calls to a generic channel_id or specific 'web' context
    const result = await processIncomingMessage({ text, channel_id: "nochannel-web-ui" });
    
    const outputTimestamp = new Date().toISOString();
    const outputPreview = result.text?.length > 100 ? result.text.substring(0, 100) + "..." : result.text;
    console.log(`[${outputTimestamp}] 📤 Response sent to Web UI (source: ${result.source}): "${outputPreview}"`);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SLACK INTERFACE ---
app.event("app_mention", async ({ event, client, logger }) => {
  try {
    const web = client;
    const resolver = new UserResolver(web);

    // Clean up the slack text (remove bot mention)
    const rawText = event.text || "";
    const stripped = rawText.replace(/<@[A-Z0-9]+>/g, "").trim();
    const cleanText = await normalizeSlackText(stripped, resolver);

    if (!cleanText) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: "What would you like me to analyze or look up?",
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const queryPreview = cleanText.length > 100 ? cleanText.substring(0, 100) + "..." : cleanText;
    console.log(`[${timestamp}] 📥 Query received from Slack (channel: ${event.channel}): "${queryPreview}"`);

    const result = await processIncomingMessage({ 
      text: cleanText, 
      channel_id: event.channel 
    });

    const outputTimestamp = new Date().toISOString();
    const outputPreview = result.text?.length > 100 ? result.text.substring(0, 100) + "..." : result.text;
    const sourceInfo = result.source === "both" ? "policy_engine + rag_history" : result.source;
    console.log(`[${outputTimestamp}] 📤 Response sent to Slack (channel: ${event.channel}, source: ${sourceInfo}): "${outputPreview}"`);

    // Format message for Slack - if both results, use a cleaner format
    let messageText = result.text || "I couldn't process that request.";
    if (result.source === "both" && result.policy_result && result.rag_result) {
      messageText = `*Policy Engine Result:*\n${result.policy_result.text}\n\n*Additional Context from Slack History:*\n${result.rag_result.text}`;
    }

    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: messageText,
    });
  } catch (err) {
    logger.error(err);
    try {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: "Error while processing (check server logs).",
      });
    } catch {}
  }
});

(async () => {
  try {
    const port = process.env.PORT || 3000;
    await app.start(port);
    console.log(`⚡️ Combined Bot & Web UI running on port ${port}`);
    console.log(`   - Slack Events: http://localhost:${port}/slack/events`);
    console.log(`   - Web UI: http://localhost:${port}/`);
    console.log(`   - API: http://localhost:${port}/api/analyze`);
    
    // Check if credentials are set (basic validation)
    const botToken = process.env.SLACK_BOT_TOKEN?.trim();
    if (!botToken || botToken.includes('placeholder')) {
      console.log('⚠️  Warning: Using placeholder SLACK_BOT_TOKEN. Update your .env file with real token.');
    }
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${process.env.PORT || 3000} is already in use.`);
      console.error('   Stop the existing process or use a different PORT.');
    } else {
      console.error('Failed to start server:', error);
    }
    process.exit(1);
  }
})();