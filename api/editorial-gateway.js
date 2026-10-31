// Vercel serverless function: the Editorial Gateway (owner P1, 2026-10-26). One authenticated endpoint that both Claude and
// ChatGPT can call, in either of two shapes:
//
//   MCP (JSON-RPC 2.0, stateless streamable HTTP): initialize, tools/list, tools/call. This is what a custom connector
//   in Claude or ChatGPT developer mode speaks.
//   REST: POST {"op":"find_event"|"upload_event_image"|"verify_event", ...arguments}. For scripts, tests and any client
//   that can send JSON but not MCP.
//
// Auth: EDITORIAL_GATEWAY_TOKEN (at least 24 characters, set in Vercel), sent as "Authorization: Bearer <token>" or
// "X-Editorial-Token". Unset or short means every call is refused. The Supabase service-role key stays on the server.
// The work is in api/_lib/editorial-gateway.js; read project/editorial-gateway/README.md for the rules and the client matrix.

const gateway = require("./_lib/editorial-gateway");

const SUPABASE_URL = process.env.SUPABASE_URL;
// Non-production deployments must never use the production database (api/_lib/environment.js).
require("./_lib/environment").assertDatabaseAllowed(SUPABASE_URL);

const PROTOCOL_VERSION = "2025-06-18";

const FILE_SCHEMA = {
  type: "object",
  description: "The image file attached in the chat (ChatGPT supplies this object).",
  properties: {
    download_url: { type: "string" },
    file_id: { type: "string" },
    mime_type: { type: "string" },
    file_name: { type: "string" },
  },
  required: ["download_url", "file_id"],
  additionalProperties: true,
};

const TOOLS = [
  {
    name: "find_event",
    description: "Search 313.events for existing events by title, venue or date, or load one by event_id. Always run this before creating or changing anything, so a duplicate is never created. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words from the title, venue or external id." },
        date: { type: "string", description: "Event date, YYYY-MM-DD." },
        event_id: { type: "string", description: "Event UUID, when already known." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "upload_event_image",
    description: "Store a promotional image for an EXISTING event in the public event-flyers bucket and set that event's image_url. Never creates events, never overwrites an existing image unless replace is true. Defaults to a dry run that checks everything and writes nothing; pass dry_run:false to apply. Provide exactly one of file, image_url, image_base64.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "UUID of the event, from find_event." },
        file: FILE_SCHEMA,
        image_url: { type: "string", description: "Public https URL of the image." },
        image_base64: { type: "string", description: "Raw image bytes, base64 (small images only)." },
        expected_sha256: { type: "string", description: "Optional SHA-256 the bytes must match." },
        dry_run: { type: "boolean", description: "Default true. Set false to write." },
        replace: { type: "boolean", description: "Only when the owner wants an existing image replaced." },
        source_note: { type: "string", description: "Where the artwork came from (for example: supplied by the organizer, permission on file)." },
        client: { type: "string", description: "Which assistant is calling (claude or chatgpt)." },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { "openai/fileParams": ["file"] },
  },
  {
    name: "verify_event",
    description: "Check an event end to end as a visitor would see it: the database row, the public view, the image bytes at its public URL, and the event page. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        expected_sha256: { type: "string", description: "Optional SHA-256 the stored image must match." },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

function makeCtx(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return {
    supabaseUrl: SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: process.env.PUBLIC_SITE_URL || (host ? `${proto}://${host}` : null),
  };
}

function describeError(err) {
  if (err instanceof gateway.GatewayError) return { status: err.status, body: Object.assign({ code: err.code, message: err.message }, err.extra) };
  return { status: 500, body: { code: "internal_error", message: "The gateway failed unexpectedly; nothing further was attempted." } };
}

async function execute(ctx, op, args) {
  const started = Date.now();
  try {
    const result = await gateway.run(ctx, op, args);
    console.log(JSON.stringify({ gateway: op, ok: true, outcome: result.outcome || null, event_id: (args && args.event_id) || null, ms: Date.now() - started }));
    return { ok: true, result };
  } catch (err) {
    const d = describeError(err);
    console.log(JSON.stringify({ gateway: op, ok: false, code: d.body.code, event_id: (args && args.event_id) || null, ms: Date.now() - started }));
    if (!(err instanceof gateway.GatewayError)) console.error("editorial-gateway unexpected error:", err && err.message);
    return { ok: false, status: d.status, error: d.body };
  }
}

async function handleMcp(ctx, msg, res) {
  const id = msg.id;
  const reply = (result) => res.status(200).json({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => res.status(200).json({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) { res.status(202).end(); return; } // a notification: no response body
  switch (msg.method) {
    case "initialize":
      reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "313events-editorial-gateway", version: "1.0.0" },
        instructions: "Use find_event first. Only existing events can get images. upload_event_image defaults to a dry run; apply with dry_run:false. Never invent event details." });
      return;
    case "ping": reply({}); return;
    case "tools/list": reply({ tools: TOOLS }); return;
    case "tools/call": {
      const params = msg.params || {};
      if (!TOOLS.some((t) => t.name === params.name)) { fail(-32602, "Unknown tool."); return; }
      const out = await execute(ctx, params.name, params.arguments || {});
      const payload = out.ok ? out.result : { error: out.error };
      reply({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: !out.ok });
      return;
    }
    default: fail(-32601, "Method not found.");
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!gateway.authorized(req.headers, process.env.EDITORIAL_GATEWAY_TOKEN)) {
    // One line per refusal: a reason word and facts about the server's token (state, length class, stray whitespace), never a value.
    console.log(JSON.stringify({ gateway_auth: "refused", reason: gateway.authFailureReason(req.headers, process.env.EDITORIAL_GATEWAY_TOKEN), configured: gateway.tokenStatus(process.env.EDITORIAL_GATEWAY_TOKEN), method: req.method, vercel_env: process.env.VERCEL_ENV || null }));
    res.status(401).json({ error: { code: "unauthorized", message: "Unauthorized." } });
    return;
  }
  if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: { code: "not_configured", message: "Database is not configured." } });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: { code: "method_not_allowed", message: "POST only." } });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: { code: "bad_request", message: "Send a JSON object." } });
    return;
  }

  const ctx = makeCtx(req);
  if (body.jsonrpc === "2.0") { await handleMcp(ctx, body, res); return; }

  const { op, ...args } = body;
  const out = await execute(ctx, op, args);
  if (out.ok) res.status(200).json({ ok: true, result: out.result });
  else res.status(out.status).json({ ok: false, error: out.error });
};

module.exports.TOOLS = TOOLS;
