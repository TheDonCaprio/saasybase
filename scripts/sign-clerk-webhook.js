#!/usr/bin/env node
/**
 * sign-clerk-webhook.js
 *
 * Usage:
 *   CLERK_WEBHOOK_SECRET=whsec_<base64> node scripts/sign-clerk-webhook.js ./payload.json
 *   CLERK_WEBHOOK_SECRET=whsec_<base64> node scripts/sign-clerk-webhook.js '{"data":{"id":"user_123"}}'
 *
 * The script prints curl-ready headers (svix-id, svix-timestamp, svix-signature) and the
 * body so you can POST to your local webhook endpoint and simulate a signed Clerk event.
 */

const fs = require('fs');
const path = require('path');
const { Webhook } = require('svix');

function usageAndExit() {
  console.error('\nUsage:\n  CLERK_WEBHOOK_SECRET=whsec_<secret> node scripts/sign-clerk-webhook.js <payload-or-file>\n');
  process.exit(1);
}

async function main() {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ERROR: CLERK_WEBHOOK_SECRET must be set in the environment (eg. whsec_<base64>)');
    usageAndExit();
  }

  const arg = process.argv[2];
  if (!arg) usageAndExit();

  let payloadStr = arg;
  // If arg is a path to a file, read it
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    payloadStr = fs.readFileSync(arg, 'utf8');
  }

  // If payload is a JS object literal passed as an argument, keep it as-is.
  // Ensure we have a string payload
  try {
    // Normalize to a compact JSON string if possible
    const parsed = JSON.parse(payloadStr);
    payloadStr = JSON.stringify(parsed);
  } catch (e) {
    // leave payloadStr as provided
  }

  const wh = new Webhook(secret);
  const msgId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `msg_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const timestamp = new Date();
  const signature = wh.sign(msgId, timestamp, payloadStr); // returns something like 'v1,<sig>'
  const timestampSeconds = Math.floor(timestamp.getTime() / 1000).toString();

  // Print headers and curl command
  console.log('\n--- Signed Webhook Headers ---\n');
  console.log(`svix-id: ${msgId}`);
  console.log(`svix-timestamp: ${timestampSeconds}`);
  console.log(`svix-signature: ${signature}`);

  console.log('\n--- Curl command (adjust URL as needed) ---\n');
  const escapedBody = payloadStr.replace(/"/g, '\\"');
  console.log(`curl -i -X POST http://localhost:3000/api/webhooks/clerk \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "svix-id: ${msgId}" \\`);
  console.log(`  -H "svix-timestamp: ${timestampSeconds}" \\`);
  console.log(`  -H "svix-signature: ${signature}" \\`);
  console.log(`  -d '${payloadStr}'`);

  console.log('\n--- Raw body ---\n');
  console.log(payloadStr);
  console.log('\n');
}

main().catch((e) => { console.error('ERROR', e && e.message ? e.message : e); process.exit(1); });
