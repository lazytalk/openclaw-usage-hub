import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  CHART_DIMENSIONS,
  CHART_METRICS,
  DEFAULT_CHART_DIMENSIONS,
  DEFAULT_CHART_METRICS,
  type ChartMetric,
} from "@/lib/chart-options";

type ChartRow = {
  path: string[];
  metrics: Record<string, number>;
};

type WindowUnit = "minute" | "hour" | "day" | "month";
type FilterMode = "rolling" | "period";

const METRIC_SQL: Record<ChartMetric, string> = {
  events: "COUNT(*)::double precision",
  input_tokens: "COALESCE(SUM(input_tokens), 0)::double precision",
  output_tokens: "COALESCE(SUM(output_tokens), 0)::double precision",
  total_tokens: "COALESCE(SUM(total_tokens), 0)::double precision",
  cache_read_tokens: "COALESCE(SUM(cache_read_tokens), 0)::double precision",
  cache_write_tokens: "COALESCE(SUM(cache_write_tokens), 0)::double precision",
  reasoning_tokens: "COALESCE(SUM(reasoning_tokens), 0)::double precision",
  estimated_cost_usd: "COALESCE(SUM(estimated_cost_usd), 0)::double precision",
  tool_call_count: "COALESCE(SUM(tool_call_count), 0)::double precision",
  error_events: "COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)::double precision",
  success_events: "COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0)::double precision",
};

function parseList<T extends string>(
  raw: string | null,
  allowed: Record<T, string>,
  fallback: T[],
  maxItems: number,
) {
  if (!raw) return fallback;

  const deduped: T[] = [];
  for (const item of raw.split(",").map((value) => value.trim()).filter(Boolean)) {
    if (!(item in allowed)) continue;
    const typedItem = item as T;
    if (deduped.includes(typedItem)) continue;
    deduped.push(typedItem);
    if (deduped.length >= maxItems) break;
  }

  return deduped.length ? deduped : fallback;
}

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

  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  const maxSpanDays = 365;
  const spanDays = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;

  if (spanDays > maxSpanDays) {
    const adjustedFrom = new Date(to);
    adjustedFrom.setUTCDate(adjustedFrom.getUTCDate() - (maxSpanDays - 1));
    fromDate = formatDateOnly(adjustedFrom);
  }

  return { fromDate, toDate };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dimensions = parseList(searchParams.get("dimensions"), CHART_DIMENSIONS, DEFAULT_CHART_DIMENSIONS, 6);
  const metrics = parseList(searchParams.get("metrics"), CHART_METRICS, DEFAULT_CHART_METRICS, 8);
  const filterMode = parseFilterMode(searchParams.get("filterMode"));
  const windowUnit = parseWindowUnit(searchParams.get("windowUnit"));
  const windowValue = parseWindowValue(searchParams.get("windowValue") ?? searchParams.get("days"), windowUnit);
  const { fromDate, toDate } = parsePeriodRange(searchParams.get("fromDate"), searchParams.get("toDate"));

  const dimensionSql = dimensions
    .map((dimension, index) => `COALESCE(${dimension}, 'unknown') AS d${index}`)
    .join(", ");
  const metricSql = metrics
    .map((metric, index) => `${METRIC_SQL[metric]} AS m${index}`)
    .join(", ");
  const groupBySql = dimensions.map((_, index) => `d${index}`).join(", ");
  const orderBySql = dimensions.map((_, index) => `d${index} ASC`).join(", ");

  const whereSql = filterMode === "period"
    ? "created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')"
    : `created_at >= NOW() - ($1::int *
      CASE $2::text
        WHEN 'minute' THEN INTERVAL '1 minute'
        WHEN 'hour' THEN INTERVAL '1 hour'
        WHEN 'month' THEN INTERVAL '1 month'
        ELSE INTERVAL '1 day'
      END)`;

  const sql = `
    SELECT ${dimensionSql}, ${metricSql}
    FROM usage_events
    WHERE ${whereSql}
    GROUP BY ${groupBySql}
    ORDER BY ${orderBySql}
    LIMIT 2000
  `;

  const params = filterMode === "period"
    ? [fromDate, toDate]
    : [windowValue, windowUnit];

  const result = await query<Record<string, string | number>>(sql, params);

  const rows: ChartRow[] = result.rows.map((row) => ({
    path: dimensions.map((_, index) => String(row[`d${index}`] ?? "unknown")),
    metrics: Object.fromEntries(
      metrics.map((metric, index) => {
        const value = Number(row[`m${index}`] ?? 0);
        return [metric, Number.isFinite(value) ? value : 0];
      }),
    ),
  }));

  return NextResponse.json({
    dimensions,
    metrics,
    filterMode,
    windowValue,
    windowUnit,
    fromDate,
    toDate,
    rows,
  });
}
