export const CHART_DIMENSIONS = {
  provider: "Provider",
  model: "Model",
  channel_name: "Channel",
  machine_identity: "Machine",
  gateway_profile: "Gateway",
  status: "Status",
  call_source: "Source",
  platform_user_display_name: "User",
  agent_name: "Agent",
} as const;

export const CHART_METRICS = {
  events: "Events",
  input_tokens: "Input tokens",
  output_tokens: "Output tokens",
  total_tokens: "Total tokens",
  cache_read_tokens: "Cache read tokens",
  cache_write_tokens: "Cache write tokens",
  reasoning_tokens: "Reasoning tokens",
  estimated_cost_usd: "Estimated cost (USD)",
  tool_call_count: "Tool calls",
  error_events: "Error events",
  success_events: "Success events",
} as const;

export type ChartDimension = keyof typeof CHART_DIMENSIONS;
export type ChartMetric = keyof typeof CHART_METRICS;

export const DEFAULT_CHART_DIMENSIONS: ChartDimension[] = ["provider", "model", "channel_name"];
export const DEFAULT_CHART_METRICS: ChartMetric[] = ["events", "input_tokens", "output_tokens", "estimated_cost_usd"];
