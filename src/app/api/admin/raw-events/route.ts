import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  CHART_DIMENSIONS,
  CHART_METRICS,
  USAGE_EVENT_COLUMNS,
  type ChartDimension,
  type ChartMetric,
  type UsageEventColumn,
} from "@/lib/chart-options";

type WindowUnit = "minute" | "hour" | "day" | "month";
type FilterMode = "rolling" | "period";

const METRIC_SQL: Record<ChartMetric, string> = {
  events: "1::double precision",
  input_tokens: "COALESCE(input_tokens, 0)::double precision",
  output_tokens: "COALESCE(output_tokens, 0)::double precision",
  total_tokens: "COALESCE(total_tokens, 0)::double precision",
  cache_read_tokens: "COALESCE(cache_read_tokens, 0)::double precision",
  cache_write_tokens: "COALESCE(cache_write_tokens, 0)::double precision",
  reasoning_tokens: "COALESCE(reasoning_tokens, 0)::double precision",
  estimated_cost_usd: "COALESCE(estimated_cost_usd, 0)::double precision",
  input_cost_usd: "COALESCE(input_cost_usd, 0)::double precision",
  output_cost_usd: "COALESCE(output_cost_usd, 0)::double precision",
  cache_cost_usd: "COALESCE(cache_cost_usd, 0)::double precision",
  duration_ms: "COALESCE(duration_ms, 0)::double precision",
  time_to_first_token_ms: "COALESCE(time_to_first_token_ms, 0)::double precision",
  retry_count: "COALESCE(retry_count, 0)::double precision",
  tool_call_count: "COALESCE(tool_call_count, 0)::double precision",
  error_events: "CASE WHEN status = 'error' THEN 1 ELSE 0 END::double precision",
  success_events: "CASE WHEN status = 'success' THEN 1 ELSE 0 END::double precision",
};

function parseWindowUnit(raw: string | null): WindowUnit {
  if (raw === "minute" || raw === "hour" || raw === "day" || raw === "month") return raw;
  return "day";
}

function parseWindowValue(raw: string | null, unit: WindowUnit) {
  const value = Number.parseInt(raw ?? "30", 10);
  if (!Number.isFinite(value)) {
    return unit === "minute" ? 60 : unit === "hour" ? 24 : unit === "month" ? 6 : 30;
  }

  const maxByUnit: Record<WindowUnit, number> = {
    minute: 1440,
    hour: 24 * 180,
    day: 365,
    month: 36,
  };

  return Math.min(Math.max(value, 1), maxByUnit[unit]);
}

function parseFilterMode(raw: string | null): FilterMode {
  return raw === "period" ? "period" : "rolling";
}

function parseIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultPeriodRange() {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    fromDate: formatDateOnly(from),
    toDate: formatDateOnly(to),
  };
}

function parsePeriodRange(fromRaw: string | null, toRaw: string | null) {
  const defaults = defaultPeriodRange();
  let fromDate = parseIsoDate(fromRaw) ?? defaults.fromDate;
  let toDate = parseIsoDate(toRaw) ?? defaults.toDate;

  if (fromDate > toDate) {
    const swap = fromDate;
    fromDate = toDate;
    toDate = swap;
  }

  return { fromDate, toDate };
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filterMode = parseFilterMode(searchParams.get("filterMode"));
  const windowUnit = parseWindowUnit(searchParams.get("windowUnit"));
  const windowValue = parseWindowValue(searchParams.get("windowValue") ?? searchParams.get("days"), windowUnit);
  const { fromDate, toDate } = parsePeriodRange(searchParams.get("fromDate"), searchParams.get("toDate"));
  const page = parsePositiveInt(searchParams.get("page"), 1, 1, 1000000);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 10, 200);

  const whereParts: string[] = [];
  const params: Array<string | number> = [];

  if (filterMode === "period") {
    params.push(fromDate, toDate);
    whereParts.push(`created_at >= $${params.length - 1}::date`);
    whereParts.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  } else {
    params.push(windowValue, windowUnit);
    whereParts.push(
      `created_at >= NOW() - ($${params.length - 1}::int *
        CASE $${params.length}::text
          WHEN 'minute' THEN INTERVAL '1 minute'
          WHEN 'hour' THEN INTERVAL '1 hour'
          WHEN 'month' THEN INTERVAL '1 month'
          ELSE INTERVAL '1 day'
        END)`,
    );
  }

  for (const dimension of Object.keys(CHART_DIMENSIONS) as ChartDimension[]) {
    const filterValue = (searchParams.get(`df_${dimension}`) ?? "").trim();
    if (!filterValue) continue;
    params.push(`%${filterValue.toLowerCase()}%`);
    whereParts.push(`LOWER(COALESCE(${dimension}, 'unknown')) LIKE $${params.length}`);
  }

  for (const metric of Object.keys(CHART_METRICS) as ChartMetric[]) {
    const minRaw = (searchParams.get(`min_${metric}`) ?? "").trim();
    if (!minRaw) continue;

    const minValue = Number(minRaw);
    if (!Number.isFinite(minValue)) continue;

    params.push(minValue);
    whereParts.push(`${METRIC_SQL[metric]} >= $${params.length}`);
  }

  const whereSql = whereParts.length ? whereParts.join(" AND ") : "TRUE";

  const countSql = `SELECT COUNT(*)::text AS total FROM usage_events WHERE ${whereSql}`;
  const countResult = await query<{ total: string }>(countSql, params);
  const total = Number(countResult.rows[0]?.total ?? "0");
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rowSql = `
    SELECT
      ${USAGE_EVENT_COLUMNS.map((column) => {
        if (column === "created_at" || column === "started_at" || column === "ended_at") {
          return `${column}::text AS ${column}`;
        }
        if (column === "tool_names_json" || column === "raw_usage_json" || column === "metadata_json") {
          return `${column}::text AS ${column}`;
        }
        return column;
      }).join(",\n      ")}
    FROM usage_events
    WHERE ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const rowResult = await query<Record<UsageEventColumn, string | number | null>>(rowSql, [...params, pageSize, offset]);

  return NextResponse.json({
    page: safePage,
    pageSize,
    total,
    totalPages,
    rows: rowResult.rows,
  });
}
