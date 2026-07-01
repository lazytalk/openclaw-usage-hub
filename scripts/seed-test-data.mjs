import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const COLUMNS = [
  "id", "created_at", "started_at", "ended_at", "duration_ms", "time_to_first_token_ms", "gateway_profile",
  "agent_id", "agent_name", "runtime_id", "machine_identity", "platform", "channel_name", "platform_user_id",
  "platform_user_display_name", "platform_tenant_id", "platform_conversation_id", "platform_message_id", "thread_id",
  "session_key", "session_id", "run_id", "turn_id", "request_id", "provider_request_id", "call_source", "provider",
  "model", "input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens",
  "estimated_cost_usd", "input_cost_usd", "output_cost_usd", "cache_cost_usd", "cost_mode", "context_tokens_before",
  "context_tokens_after", "context_window", "had_tool_calls", "tool_call_count", "tool_names_json", "status", "error_code",
  "error_message", "retry_count", "prompt_hash", "response_hash", "preview", "raw_usage_json", "metadata_json",
];

const PROFILE_DEFAULTS = {
  small: { rows: 12, days: 2, seed: 20260701 },
  large: { rows: 500, days: 30, seed: 20260702 },
  range: { rows: 240, days: 7, seed: 20260703 },
};

const gateways = ["default", "cost-optimized"];
const providers = ["openai", "anthropic"];
const channels = ["chat", "api", "cli"];
const callSources = ["chat", "terminal", "plugin-mirror"];
const machines = ["dev-laptop-a", "dev-laptop-b", "dev-laptop-c"];
const users = [
  { id: "u-001", name: "Alex" },
  { id: "u-002", name: "Sam" },
  { id: "u-003", name: "Taylor" },
];
const agents = [
  { id: "build", name: "Build" },
  { id: "explore", name: "Explore" },
];

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const options = {
    profile: "small",
    rows: null,
    days: null,
    seed: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--profile") options.profile = argv[i + 1] ?? options.profile;
    if (arg === "--rows") options.rows = Number(argv[i + 1]);
    if (arg === "--days") options.days = Number(argv[i + 1]);
    if (arg === "--seed") options.seed = Number(argv[i + 1]);
  }

  if (!(options.profile in PROFILE_DEFAULTS)) {
    throw new Error(`Unsupported profile: ${options.profile}. Use one of: small, large, range.`);
  }

  const defaults = PROFILE_DEFAULTS[options.profile];
  const rows = Number.isInteger(options.rows) && options.rows > 0 ? options.rows : defaults.rows;
  const days = Number.isInteger(options.days) && options.days > 0 ? options.days : defaults.days;
  const seed = Number.isInteger(options.seed) ? options.seed : defaults.seed;

  return { profile: options.profile, rows, days, seed };
}

function createRng(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function buildEvent(index, settings, random) {
  const provider = pick(random, providers);
  const model = provider === "anthropic"
    ? "claude-sonnet-4"
    : pick(random, ["gpt-5.3-codex", "gpt-4.1-mini"]);
  const gateway = pick(random, gateways);
  const agent = pick(random, agents);
  const user = pick(random, users);
  const machine = pick(random, machines);
  const channel = pick(random, channels);
  const source = pick(random, callSources);
  const statusRoll = random();
  const status = statusRoll < 0.86 ? "success" : statusRoll < 0.96 ? "error" : "no-usage";
  const totalTokens = 900 + Math.floor(random() * 3200);
  const inputTokens = Math.floor(totalTokens * (0.58 + random() * 0.2));
  const outputTokens = totalTokens - inputTokens;
  const cacheRead = random() < 0.35 ? Math.floor(totalTokens * (0.1 + random() * 0.4)) : 0;
  const reasoning = Math.floor(totalTokens * (0.08 + random() * 0.12));
  const durationMs = 2000 + Math.floor(random() * 4500);
  const ttftMs = 120 + Math.floor(random() * 380);
  const toolCount = channel === "chat" ? Math.floor(random() * 3) : Math.floor(random() * 2);
  const contextBefore = 1800 + Math.floor(random() * 6800);
  const contextAfter = contextBefore + outputTokens;
  const cost = Number((totalTokens / 220000 + reasoning / 500000).toFixed(6));

  const now = Date.now();
  const maxOffsetMs = settings.days * 24 * 60 * 60 * 1000;
  const createdAtMs = now - Math.floor(random() * maxOffsetMs);
  const startedAtMs = createdAtMs - (350 + Math.floor(random() * 2600));
  const endedAtMs = startedAtMs + durationMs;

  const toolNames = ["read_file", "run_in_terminal", "apply_patch"].slice(0, toolCount);
  return {
    id: `seed-${settings.profile}-${settings.days}d-${index + 1}`,
    created_at: new Date(createdAtMs).toISOString(),
    started_at: new Date(startedAtMs).toISOString(),
    ended_at: new Date(endedAtMs).toISOString(),
    duration_ms: durationMs,
    time_to_first_token_ms: ttftMs,
    gateway_profile: gateway,
    agent_id: agent.id,
    agent_name: agent.name,
    runtime_id: "node-20",
    machine_identity: machine,
    platform: "vscode",
    channel_name: channel,
    platform_user_id: user.id,
    platform_user_display_name: user.name,
    platform_tenant_id: "dev-lab",
    platform_conversation_id: `conv-${Math.ceil((index + 1) / 3)}`,
    platform_message_id: `msg-${index + 1}`,
    thread_id: `thread-${Math.ceil((index + 1) / 4)}`,
    session_key: `session-${Math.ceil((index + 1) / 5)}`,
    session_id: `session-${Math.ceil((index + 1) / 5)}`,
    run_id: `run-${index + 1}`,
    turn_id: `turn-${index + 1}`,
    request_id: `request-${index + 1}`,
    provider_request_id: `provider-${settings.profile}-${index + 1}`,
    call_source: source,
    provider,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cache_read_tokens: cacheRead,
    cache_write_tokens: 0,
    reasoning_tokens: reasoning,
    estimated_cost_usd: cost,
    input_cost_usd: Number((cost * 0.42).toFixed(6)),
    output_cost_usd: Number((cost * 0.58).toFixed(6)),
    cache_cost_usd: 0,
    cost_mode: "estimated",
    context_tokens_before: contextBefore,
    context_tokens_after: contextAfter,
    context_window: 200000,
    had_tool_calls: toolCount > 0 ? 1 : 0,
    tool_call_count: toolCount,
    tool_names_json: toolCount > 0 ? JSON.stringify(toolNames) : null,
    status,
    error_code: status === "error" ? "RATE_LIMIT" : null,
    error_message: status === "error" ? "Provider rate limit simulated for seed data" : null,
    retry_count: status === "error" ? 1 : 0,
    prompt_hash: `prompt-hash-${index + 1}`,
    response_hash: `response-hash-${index + 1}`,
    preview: `Seeded ${source} event #${index + 1} for ${model}`,
    raw_usage_json: JSON.stringify({ seed: true, profile: settings.profile, index: index + 1 }),
    metadata_json: JSON.stringify({ seed: true, env: "local", seedSet: settings.profile, days: settings.days }),
  };
}

async function main() {
  loadLocalEnv();
  const settings = parseArgs(process.argv.slice(2));
  const random = createRng(settings.seed);

  const events = Array.from({ length: settings.rows }, (_, index) => buildEvent(index, settings, random));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Add it to .env before seeding.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const event of events) {
      const values = COLUMNS.map((key) => event[key]);
      const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(", ");

      await client.query(
        `INSERT INTO usage_events (${COLUMNS.join(", ")}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${COLUMNS
          .filter((c) => c !== "id")
          .map((c) => `${c}=EXCLUDED.${c}`)
          .join(", ")}`,
        values,
      );
    }

    await client.query("COMMIT");

    const countResult = await client.query("SELECT COUNT(*)::int AS count FROM usage_events");
    const seeded = await client.query(
      "SELECT COUNT(*)::int AS count FROM usage_events WHERE id LIKE $1",
      [`seed-${settings.profile}-%`],
    );

    console.log(`Seed profile: ${settings.profile} (rows=${settings.rows}, days=${settings.days}, seed=${settings.seed})`);
    console.log(`Seeded ${events.length} test events.`);
    console.log(`Total rows in usage_events: ${countResult.rows[0].count}`);
    console.log(`Rows for this profile prefix: ${seeded.rows[0].count}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
