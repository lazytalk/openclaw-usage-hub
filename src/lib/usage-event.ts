import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { z } from "zod";

const jsonLikeSchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.string()]);

const nullableString = z.string().trim().min(1).nullable().optional();
const nullableInt = z.coerce.number().int().nullable().optional();
const nullableFloat = z.coerce.number().nullable().optional();

export const usageEventSchema = z.object({
  id: nullableString,
  created_at: nullableString,
  started_at: nullableString,
  ended_at: nullableString,
  duration_ms: nullableInt,
  time_to_first_token_ms: nullableInt,
  gateway_profile: nullableString,
  agent_id: nullableString,
  agent_name: nullableString,
  runtime_id: nullableString,
  machine_identity: nullableString,
  platform: nullableString,
  channel_name: nullableString,
  platform_user_id: nullableString,
  platform_user_display_name: nullableString,
  platform_tenant_id: nullableString,
  platform_conversation_id: nullableString,
  platform_message_id: nullableString,
  thread_id: nullableString,
  session_key: nullableString,
  session_id: nullableString,
  run_id: nullableString,
  turn_id: nullableString,
  request_id: nullableString,
  provider_request_id: nullableString,
  call_source: nullableString,
  provider: nullableString,
  model: nullableString,
  input_tokens: nullableInt,
  output_tokens: nullableInt,
  total_tokens: nullableInt,
  cache_read_tokens: nullableInt,
  cache_write_tokens: nullableInt,
  reasoning_tokens: nullableInt,
  estimated_cost_usd: nullableFloat,
  input_cost_usd: nullableFloat,
  output_cost_usd: nullableFloat,
  cache_cost_usd: nullableFloat,
  cost_mode: nullableString,
  context_tokens_before: nullableInt,
  context_tokens_after: nullableInt,
  context_window: nullableInt,
  had_tool_calls: z.coerce.number().int().nullable().optional(),
  tool_call_count: nullableInt,
  tool_names_json: z.union([z.array(z.string()), jsonLikeSchema]).nullable().optional(),
  status: nullableString,
  error_code: nullableString,
  error_message: nullableString,
  retry_count: nullableInt,
  prompt_hash: nullableString,
  response_hash: nullableString,
  preview: nullableString,
  raw_usage_json: jsonLikeSchema.nullable().optional(),
  metadata_json: jsonLikeSchema.nullable().optional(),
});

export const usageEventBatchSchema = z.object({
  events: z.array(usageEventSchema).min(1).max(1000),
});

export type UsageEventInput = z.infer<typeof usageEventSchema>;

const usageEventColumns = [
  "id",
  "created_at",
  "started_at",
  "ended_at",
  "duration_ms",
  "time_to_first_token_ms",
  "gateway_profile",
  "agent_id",
  "agent_name",
  "runtime_id",
  "machine_identity",
  "platform",
  "channel_name",
  "platform_user_id",
  "platform_user_display_name",
  "platform_tenant_id",
  "platform_conversation_id",
  "platform_message_id",
  "thread_id",
  "session_key",
  "session_id",
  "run_id",
  "turn_id",
  "request_id",
  "provider_request_id",
  "call_source",
  "provider",
  "model",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
  "estimated_cost_usd",
  "input_cost_usd",
  "output_cost_usd",
  "cache_cost_usd",
  "cost_mode",
  "context_tokens_before",
  "context_tokens_after",
  "context_window",
  "had_tool_calls",
  "tool_call_count",
  "tool_names_json",
  "status",
  "error_code",
  "error_message",
  "retry_count",
  "prompt_hash",
  "response_hash",
  "preview",
  "raw_usage_json",
  "metadata_json",
];

type UsageEventRecord = Record<(typeof usageEventColumns)[number], unknown>;

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeJson(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return value;
}

export function buildEventId(event: UsageEventInput) {
  if (event.id) return event.id;
  const stableParts = [
    event.provider_request_id,
    event.request_id,
    event.session_key,
    event.run_id,
    event.turn_id,
    event.provider,
    event.model,
    event.started_at,
  ];

  return createHash("sha256")
    .update(stableParts.map((part) => part ?? "").join("|"))
    .digest("hex")
    .slice(0, 32);
}

export function normalizeUsageEvent(event: UsageEventInput): UsageEventRecord {
  const normalized: UsageEventRecord = {
    id: buildEventId(event),
    created_at: normalizeText(event.created_at) ?? new Date().toISOString(),
    started_at: normalizeText(event.started_at),
    ended_at: normalizeText(event.ended_at),
    duration_ms: event.duration_ms ?? null,
    time_to_first_token_ms: event.time_to_first_token_ms ?? null,
    gateway_profile: normalizeText(event.gateway_profile),
    agent_id: normalizeText(event.agent_id),
    agent_name: normalizeText(event.agent_name),
    runtime_id: normalizeText(event.runtime_id),
    machine_identity: normalizeText(event.machine_identity),
    platform: normalizeText(event.platform),
    channel_name: normalizeText(event.channel_name),
    platform_user_id: normalizeText(event.platform_user_id),
    platform_user_display_name: normalizeText(event.platform_user_display_name),
    platform_tenant_id: normalizeText(event.platform_tenant_id),
    platform_conversation_id: normalizeText(event.platform_conversation_id),
    platform_message_id: normalizeText(event.platform_message_id),
    thread_id: normalizeText(event.thread_id),
    session_key: normalizeText(event.session_key),
    session_id: normalizeText(event.session_id),
    run_id: normalizeText(event.run_id),
    turn_id: normalizeText(event.turn_id),
    request_id: normalizeText(event.request_id),
    provider_request_id: normalizeText(event.provider_request_id),
    call_source: normalizeText(event.call_source),
    provider: normalizeText(event.provider),
    model: normalizeText(event.model),
    input_tokens: event.input_tokens ?? 0,
    output_tokens: event.output_tokens ?? 0,
    total_tokens: event.total_tokens ?? 0,
    cache_read_tokens: event.cache_read_tokens ?? 0,
    cache_write_tokens: event.cache_write_tokens ?? 0,
    reasoning_tokens: event.reasoning_tokens ?? 0,
    estimated_cost_usd: event.estimated_cost_usd ?? 0,
    input_cost_usd: event.input_cost_usd ?? 0,
    output_cost_usd: event.output_cost_usd ?? 0,
    cache_cost_usd: event.cache_cost_usd ?? 0,
    cost_mode: normalizeText(event.cost_mode),
    context_tokens_before: event.context_tokens_before ?? null,
    context_tokens_after: event.context_tokens_after ?? null,
    context_window: event.context_window ?? null,
    had_tool_calls: event.had_tool_calls ? 1 : 0,
    tool_call_count: event.tool_call_count ?? 0,
    tool_names_json: normalizeJson(event.tool_names_json),
    status: normalizeText(event.status),
    error_code: normalizeText(event.error_code),
    error_message: normalizeText(event.error_message),
    retry_count: event.retry_count ?? 0,
    prompt_hash: normalizeText(event.prompt_hash),
    response_hash: normalizeText(event.response_hash),
    preview: normalizeText(event.preview),
    raw_usage_json: normalizeJson(event.raw_usage_json),
    metadata_json: normalizeJson(event.metadata_json),
  };

  return normalized;
}

export async function upsertUsageEvents(events: UsageEventInput[]) {
  const normalizedEvents = events.map(normalizeUsageEvent);

  for (const event of normalizedEvents) {
    const values = usageEventColumns.map((column) => event[column]);
    const placeholders = usageEventColumns.map((_, index) => `$${index + 1}`).join(", ");
    const updates = usageEventColumns
      .filter((column) => column !== "id")
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(", ");

    await query(
      `
        INSERT INTO usage_events (${usageEventColumns.join(", ")})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET
          ${updates}
        WHERE
          CASE EXCLUDED.status
            WHEN 'success' THEN 2
            WHEN 'error' THEN 1
            WHEN 'no-usage' THEN 1
            ELSE 0
          END >=
          CASE usage_events.status
            WHEN 'success' THEN 2
            WHEN 'error' THEN 1
            WHEN 'no-usage' THEN 1
            ELSE 0
          END
      `,
      values,
    );
  }

  return normalizedEvents;
}
