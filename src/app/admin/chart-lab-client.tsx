"use client";

import { useMemo, useState } from "react";
import {
  CHART_DIMENSIONS,
  CHART_METRICS,
  DEFAULT_CHART_DIMENSIONS,
  DEFAULT_CHART_METRICS,
  USAGE_EVENT_COLUMNS,
  type ChartDimension,
  type ChartMetric,
  type UsageEventColumn,
} from "@/lib/chart-options";

type ApiChartRow = {
  path: string[];
  metrics: Record<string, number>;
};

type ApiResponse = {
  dimensions: ChartDimension[];
  metrics: ChartMetric[];
  filterMode: "rolling" | "period";
  windowValue: number;
  windowUnit: "minute" | "hour" | "day" | "month";
  fromDate: string;
  toDate: string;
  rows: ApiChartRow[];
};

type TrendApiResponse = {
  dimensions: ChartDimension[];
  path: string[];
  metrics: ChartMetric[];
  rows: Array<{ id: string; createdAt: string; metrics: Record<string, number> }>;
};

type TrendState = {
  rows: Array<{ id: string; createdAt: string; metrics: Record<string, number> }>;
  loading: boolean;
  error: string | null;
};

type RawEventRow = Record<UsageEventColumn, string | number | null>;

type RawEventsResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: RawEventRow[];
};

type RawEventResponse = {
  row: RawEventRow;
};

type WindowUnit = "minute" | "hour" | "day" | "month";
type FilterMode = "rolling" | "period";

type DateRange = {
  fromDate: string;
  toDate: string;
};

type TreeNode = {
  key: string;
  path: string[];
  label: string;
  depth: number;
  metrics: Record<ChartMetric, number>;
  children: TreeNode[];
};

const dimensionEntries = Object.entries(CHART_DIMENSIONS) as Array<[ChartDimension, string]>;
const metricGroups: Array<{ title: string; metrics: ChartMetric[] }> = [
  {
    title: "Tokens & costs",
    metrics: [
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
    ],
  },
  {
    title: "Latency & reliability",
    metrics: ["duration_ms", "time_to_first_token_ms", "retry_count"],
  },
  {
    title: "Tools & events",
    metrics: ["events", "tool_call_count", "success_events", "error_events"],
  },
];
const MAX_LEVELS = 6;
const windowUnitEntries: Array<{ value: WindowUnit; label: string }> = [
  { value: "minute", label: "Minutes" },
  { value: "hour", label: "Hours" },
  { value: "day", label: "Days" },
  { value: "month", label: "Months" },
];
const filterModeEntries: Array<{ value: FilterMode; label: string }> = [
  { value: "rolling", label: "Rolling window" },
  { value: "period", label: "Date period" },
];

function dateOnlyDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function dateOnlyFromUtcParts(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function getPeriodPreset(preset: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth"): DateRange {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (preset === "today") {
    const day = today.toISOString().slice(0, 10);
    return { fromDate: day, toDate: day };
  }

  if (preset === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const day = yesterday.toISOString().slice(0, 10);
    return { fromDate: day, toDate: day };
  }

  if (preset === "last7") {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 6);
    return {
      fromDate: from.toISOString().slice(0, 10),
      toDate: today.toISOString().slice(0, 10),
    };
  }

  if (preset === "thisMonth") {
    const start = dateOnlyFromUtcParts(today.getUTCFullYear(), today.getUTCMonth(), 1);
    const end = today.toISOString().slice(0, 10);
    return { fromDate: start, toDate: end };
  }

  const lastMonthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const start = dateOnlyFromUtcParts(lastMonthDate.getUTCFullYear(), lastMonthDate.getUTCMonth(), 1);
  const end = dateOnlyFromUtcParts(lastMonthDate.getUTCFullYear(), lastMonthDate.getUTCMonth() + 1, 0);
  return { fromDate: start, toDate: end };
}

const METRIC_BAR_STYLE: Record<ChartMetric, string> = {
  events: "bg-teal-700",
  input_tokens: "bg-sky-600",
  output_tokens: "bg-cyan-600",
  total_tokens: "bg-indigo-600",
  cache_read_tokens: "bg-emerald-600",
  cache_write_tokens: "bg-lime-600",
  reasoning_tokens: "bg-fuchsia-600",
  estimated_cost_usd: "bg-amber-600",
  input_cost_usd: "bg-orange-600",
  output_cost_usd: "bg-yellow-700",
  cache_cost_usd: "bg-amber-800",
  duration_ms: "bg-slate-600",
  time_to_first_token_ms: "bg-zinc-600",
  retry_count: "bg-stone-600",
  tool_call_count: "bg-violet-600",
  error_events: "bg-rose-600",
  success_events: "bg-green-700",
};

function formatMetric(metric: ChartMetric, value: number) {
  if (metric === "estimated_cost_usd" || metric === "input_cost_usd" || metric === "output_cost_usd" || metric === "cache_cost_usd") {
    return `$${value.toFixed(4)}`;
  }
  if (metric === "duration_ms" || metric === "time_to_first_token_ms") {
    return `${Math.round(value).toLocaleString()} ms`;
  }
  return Math.round(value).toLocaleString();
}

function formatAxisMetric(metric: ChartMetric, value: number, maxValue: number) {
  if (metric === "estimated_cost_usd" || metric === "input_cost_usd" || metric === "output_cost_usd" || metric === "cache_cost_usd") {
    if (maxValue < 0.01) return `$${value.toFixed(5)}`;
    if (maxValue < 1) return `$${value.toFixed(3)}`;
    return `$${value.toFixed(2)}`;
  }

  if (metric === "duration_ms" || metric === "time_to_first_token_ms") {
    if (maxValue <= 5) return `${value.toFixed(2)} ms`;
    if (maxValue <= 50) return `${value.toFixed(1)} ms`;
    return `${Math.round(value).toLocaleString()} ms`;
  }

  // Preserve fractional steps for small ranges so ticks don't collapse to only 0/1.
  if (maxValue <= 5) return value.toFixed(2);
  if (maxValue <= 50) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

function formatTrendTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function formatTrendTickTime(value: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(5, 16).replace("T", " ");
}

function humanizeColumnName(column: string) {
  return column.replaceAll("_", " ");
}

function formatRawCell(column: UsageEventColumn, value: string | number | null) {
  if (value == null) return "";

  if (column === "created_at" || column === "started_at" || column === "ended_at") {
    return formatTrendTime(String(value));
  }

  if (column === "estimated_cost_usd" || column === "input_cost_usd" || column === "output_cost_usd" || column === "cache_cost_usd") {
    return formatMetric("estimated_cost_usd", Number(value));
  }

  if (typeof value === "number") return value.toLocaleString();

  return String(value);
}

function buildTree(rows: ApiChartRow[], selectedMetrics: ChartMetric[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  function getOrCreateNode(path: string[], depth: number) {
    const key = path.slice(0, depth + 1).join("||");
    const label = path[depth] ?? "unknown";

    if (nodeMap.has(key)) return nodeMap.get(key)!;

    const node: TreeNode = {
      key,
      path: path.slice(0, depth + 1),
      label,
      depth,
      metrics: Object.fromEntries(selectedMetrics.map((metric) => [metric, 0])) as Record<ChartMetric, number>,
      children: [],
    };

    nodeMap.set(key, node);

    if (depth === 0) {
      roots.push(node);
    } else {
      const parent = getOrCreateNode(path, depth - 1);
      parent.children.push(node);
    }

    return node;
  }

  for (const row of rows) {
    for (let depth = 0; depth < row.path.length; depth += 1) {
      const node = getOrCreateNode(row.path, depth);
      for (const metric of selectedMetrics) {
        node.metrics[metric] += Number(row.metrics[metric] ?? 0);
      }
    }
  }

  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => b.metrics[selectedMetrics[0]] - a.metrics[selectedMetrics[0]] || a.label.localeCompare(b.label));
    for (const node of nodes) sortNodes(node.children);
  }

  sortNodes(roots);
  return roots;
}

function collectNodes(nodes: TreeNode[]): TreeNode[] {
  const all: TreeNode[] = [];

  function visit(current: TreeNode[]) {
    for (const node of current) {
      all.push(node);
      if (node.children.length) visit(node.children);
    }
  }

  visit(nodes);
  return all;
}

function buildTrendKey(nodeKey: string, metric: ChartMetric) {
  return `${nodeKey}::${metric}`;
}

function TrendLineChart({
  rows,
  metric,
  onSelectCall,
}: {
  rows: Array<{ id: string; createdAt: string; metrics: Record<string, number> }>;
  metric: ChartMetric;
  onSelectCall: (id: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartHeight = 180;
  const chartWidth = Math.max(420, rows.length * 10);
  const padding = { top: 12, right: 12, bottom: 30, left: 56 };
  const innerWidth = Math.max(chartWidth - padding.left - padding.right, 1);
  const innerHeight = Math.max(chartHeight - padding.top - padding.bottom, 1);
  const baselineY = chartHeight - padding.bottom;

  const trendData = useMemo(() => {
    const values = rows.map((row) => Number(row.metrics[metric] ?? 0));
    const maxValue = Math.max(...values, 0);
    const timestamps = rows.map((row) => {
      const time = new Date(row.createdAt).getTime();
      return Number.isFinite(time) ? time : NaN;
    });
    const validTimes = timestamps.filter((time) => Number.isFinite(time));
    const minTime = validTimes.length ? Math.min(...validTimes) : 0;
    const maxTime = validTimes.length ? Math.max(...validTimes) : 0;
    const timeSpan = Math.max(maxTime - minTime, 0);

    const points = rows.map((row, index) => {
      const value = Number(row.metrics[metric] ?? 0);
      const ratio = maxValue > 0 ? value / maxValue : 0;
      const rowTime = timestamps[index];
      const hasValidTime = Number.isFinite(rowTime);
      const timeRatio = hasValidTime && timeSpan > 0
        ? (rowTime - minTime) / timeSpan
        : rows.length > 1
          ? index / (rows.length - 1)
          : 0.5;
      const x = padding.left + timeRatio * innerWidth;
      const y = padding.top + (innerHeight - ratio * innerHeight);

      return {
        id: row.id,
        createdAt: row.createdAt,
        timestamp: rowTime,
        value,
        x,
        y,
      };
    });

    return {
      points,
      maxValue,
      minTime,
      maxTime,
      hasTimeRange: timeSpan > 0,
    };
  }, [rows, metric, innerHeight, innerWidth, padding.left, padding.top]);

  const points = trendData.points;

  const yTicks = useMemo(() => {
    const ratios = [0, 0.25, 0.5, 0.75, 1];
    return ratios.map((ratio) => {
      const value = trendData.maxValue * ratio;
      return {
        ratio,
        y: baselineY - ratio * innerHeight,
        label: formatAxisMetric(metric, value, trendData.maxValue),
      };
    });
  }, [baselineY, innerHeight, metric, trendData.maxValue]);

  const xTicks = useMemo(() => {
    if (!points.length) return [] as Array<{ x: number; label: string }>;

    if (trendData.hasTimeRange) {
      const ratios = [0, 1 / 3, 2 / 3, 1];
      return ratios.map((ratio) => {
        const value = trendData.minTime + (trendData.maxTime - trendData.minTime) * ratio;
        return {
          x: padding.left + ratio * innerWidth,
          label: formatTrendTickTime(value),
        };
      });
    }

    const indexSet = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
    return indexSet.map((index) => ({
      x: points[index].x,
      label: formatTrendTickTime(new Date(points[index].createdAt).getTime()),
    }));
  }, [innerWidth, padding.left, points, trendData.hasTimeRange, trendData.maxTime, trendData.minTime]);

  const hoveredPoint = hoveredIndex == null ? null : points[hoveredIndex] ?? null;

  return (
    <div className="relative mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-2">
      <div className="overflow-x-auto">
        <svg
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="block"
          role="img"
          aria-label="Trend line chart by modeling call time"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={baselineY}
            stroke="#d6d3d1"
            strokeWidth="1"
          />

          <line
            x1={padding.left}
            y1={baselineY}
            x2={chartWidth - padding.right}
            y2={baselineY}
            stroke="#d6d3d1"
            strokeWidth="1"
          />

          {yTicks.map((tick) => (
            <g key={`y-tick-${tick.ratio}`}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={chartWidth - padding.right}
                y2={tick.y}
                stroke="#ece9e5"
                strokeWidth="1"
              />
              <text
                x={padding.left - 6}
                y={tick.y + 3}
                textAnchor="end"
                fontSize="10"
                fill="#78716c"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {xTicks.map((tick, index) => (
            <g key={`x-tick-${index}`}>
              <line
                x1={tick.x}
                y1={baselineY}
                x2={tick.x}
                y2={baselineY + 4}
                stroke="#d6d3d1"
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={baselineY + 15}
                textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
                fontSize="10"
                fill="#78716c"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {points.map((point, index) => (
            <g key={`point-${point.id}-${index}`}>
              <line
                x1={point.x}
                y1={baselineY}
                x2={point.x}
                y2={point.y}
                stroke={hoveredIndex === index ? "#115e59" : "#0f766e"}
                strokeWidth={hoveredIndex === index ? "2.5" : "2"}
                strokeLinecap="round"
                onClick={() => onSelectCall(point.id)}
                className="cursor-pointer"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="2.5"
                fill={hoveredIndex === index ? "#115e59" : "#0f766e"}
                onClick={() => onSelectCall(point.id)}
                className="cursor-pointer"
              />
              <circle
                cx={point.x}
                cy={(baselineY + point.y) / 2}
                r={Math.max((baselineY - point.y) / 2, 8)}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(index)}
                onClick={() => onSelectCall(point.id)}
                className="cursor-pointer"
              />
            </g>
          ))}
        </svg>
      </div>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs shadow"
          style={{
            left: `${Math.min(Math.max((hoveredPoint.x / chartWidth) * 100, 6), 92)}%`,
            top: "8px",
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-mono text-[11px] text-stone-600">{formatTrendTime(hoveredPoint.createdAt)}</p>
          <p className="font-mono text-[11px] text-stone-900">{CHART_METRICS[metric]}: {formatMetric(metric, hoveredPoint.value)}</p>
        </div>
      ) : null}

      <p className="mt-2 text-[11px] text-stone-500">Hover points on the line to see modeling call time and value.</p>
    </div>
  );
}

function ChartNode({
  node,
  metrics,
  globalMetricMax,
  levelLabels,
  trendByKey,
  onSelectNode,
  onCloseTrend,
  onOpenCallDetail,
}: {
  node: TreeNode;
  metrics: ChartMetric[];
  globalMetricMax: number;
  levelLabels: string[];
  trendByKey: Record<string, TrendState>;
  onSelectNode: (node: TreeNode, metric: ChartMetric) => void;
  onCloseTrend: (node: TreeNode, metric: ChartMetric) => void;
  onOpenCallDetail: (id: string) => void;
}) {
  const hasOpenTrend = metrics.some((metric) => !!trendByKey[buildTrendKey(node.key, metric)]);

  const levelText = levelLabels[node.depth] ? `${levelLabels[node.depth]}: ` : "";

  return (
    <details open className="rounded-2xl bg-[var(--surface-strong)] px-3 py-3">
      <summary className="cursor-pointer list-none rounded-xl p-2">
        <div className="flex items-center justify-between gap-4 text-sm text-stone-800">
          <span className="truncate pr-4">{levelText}{node.label}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {metrics.map((metric) => (
              <span key={`${node.key}-${metric}`} className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 font-mono text-xs text-stone-700">
                {CHART_METRICS[metric]}: {formatMetric(metric, node.metrics[metric] ?? 0)}
              </span>
            ))}
          </div>
        </div>
      </summary>

      <div className={`space-y-2 rounded-xl p-2 ${hasOpenTrend ? "ring-2 ring-teal-600/35 bg-white/80" : ""}`}>
        {metrics.map((metric) => {
          const value = node.metrics[metric] ?? 0;
          const width = globalMetricMax > 0 ? (value / globalMetricMax) * 100 : 0;
          const trendKey = buildTrendKey(node.key, metric);
          const trendState = trendByKey[trendKey];
          const showTrend = !!trendState;
          const trendRows = trendState?.rows ?? [];
          const trendLoading = trendState?.loading ?? false;
          const trendError = trendState?.error ?? null;

          return (
            <div key={`${node.key}-bar-${metric}`} className="space-y-2">
              <button
                type="button"
                onClick={() => onSelectNode(node, metric)}
                className="grid w-full grid-cols-[9rem_1fr] items-center gap-2 text-left text-xs text-stone-700"
                title="Click bar to drill into time trend"
              >
                <span className="truncate">{CHART_METRICS[metric]}</span>
                <div className="h-2.5 rounded-full bg-white/80">
                  <div
                    className={`h-full rounded-full ${METRIC_BAR_STYLE[metric]}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </button>

              {showTrend ? (
                <section className="rounded-xl border border-[var(--border)] bg-white px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-500">Trend drill</p>
                      <p className="mt-1 text-sm text-stone-700">
                        {CHART_METRICS[metric]} for <span className="font-medium text-stone-900">{node.path.join(" > ")}</span>
                      </p>
                      <p className="text-xs text-stone-500">Unit: modeling call (per event)</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCloseTrend(node, metric)}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-stone-700 transition hover:border-stone-900"
                      aria-label="Close trend"
                    >
                      X
                    </button>
                  </div>

                  {trendError ? (
                    <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{trendError}</p>
                  ) : null}

                  {trendLoading ? (
                    <p className="mt-3 text-sm text-stone-600">Loading trend...</p>
                  ) : null}

                  {!trendLoading && !trendError && !trendRows.length ? (
                    <p className="mt-3 rounded-xl bg-[var(--surface-strong)] px-3 py-2 text-sm text-stone-600">No trend rows for this selection.</p>
                  ) : null}

                  {!trendLoading && !trendError && trendRows.length ? (
                    <TrendLineChart rows={trendRows} metric={metric} onSelectCall={onOpenCallDetail} />
                  ) : null}
                </section>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 ml-3 space-y-3 border-l border-[var(--border)] pl-3">
        {node.children.map((child) => (
          <ChartNode
            key={child.key}
            node={child}
            metrics={metrics}
            globalMetricMax={globalMetricMax}
            levelLabels={levelLabels}
            trendByKey={trendByKey}
            onSelectNode={onSelectNode}
            onCloseTrend={onCloseTrend}
            onOpenCallDetail={onOpenCallDetail}
          />
        ))}
      </div>
    </details>
  );
}

export default function ChartLabClient() {
  const [levels, setLevels] = useState<ChartDimension[]>([
    "provider",
    "model",
    "channel_name",
  ]);
  const [selectedMetrics, setSelectedMetrics] = useState<ChartMetric[]>(DEFAULT_CHART_METRICS);
  const [filterMode, setFilterMode] = useState<FilterMode>("rolling");
  const [windowValue, setWindowValue] = useState(30);
  const [windowUnit, setWindowUnit] = useState<WindowUnit>("day");
  const [fromDate, setFromDate] = useState(dateOnlyDaysAgo(29));
  const [toDate, setToDate] = useState(dateOnlyDaysAgo(0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ApiChartRow[]>([]);
  const [trendByKey, setTrendByKey] = useState<Record<string, TrendState>>({});
  const [dimensionFilters, setDimensionFilters] = useState<Partial<Record<ChartDimension, string>>>({});
  const [metricMinFilters, setMetricMinFilters] = useState<Partial<Record<ChartMetric, string>>>({});
  const [rawRows, setRawRows] = useState<RawEventRow[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawPage, setRawPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState(20);
  const [rawTotal, setRawTotal] = useState(0);
  const [rawTotalPages, setRawTotalPages] = useState(1);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [selectedRawEvent, setSelectedRawEvent] = useState<RawEventRow | null>(null);
  const [rawDetailLoading, setRawDetailLoading] = useState(false);
  const [rawDetailError, setRawDetailError] = useState<string | null>(null);

  const orderedDimensions = useMemo(() => {
    const unique: ChartDimension[] = [];
    for (const item of levels) {
      if (!(item in CHART_DIMENSIONS)) continue;
      if (!unique.includes(item)) unique.push(item);
      if (unique.length === MAX_LEVELS) break;
    }

    if (!unique.length) unique.push(DEFAULT_CHART_DIMENSIONS[0]);

    return unique;
  }, [levels]);

  async function fetchData(
    nextDimensions: ChartDimension[],
    nextMetrics: ChartMetric[],
    nextFilterMode: FilterMode,
    nextWindowValue: number,
    nextWindowUnit: WindowUnit,
    nextFromDate: string,
    nextToDate: string,
  ) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        dimensions: nextDimensions.join(","),
        metrics: nextMetrics.join(","),
        filterMode: nextFilterMode,
      });

      if (nextFilterMode === "period") {
        params.set("fromDate", nextFromDate);
        params.set("toDate", nextToDate);
      } else {
        params.set("windowValue", String(nextWindowValue));
        params.set("windowUnit", nextWindowUnit);
      }

      const response = await fetch(`/api/admin/chart-data?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const payload = (await response.json()) as ApiResponse;
      setRows(payload.rows);
      setFilterMode(payload.filterMode);
      setWindowValue(payload.windowValue);
      setWindowUnit(payload.windowUnit);
      setFromDate(payload.fromDate);
      setToDate(payload.toDate);
      setTrendByKey({});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load chart data.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTrend(nodeKey: string, path: string[], metric: ChartMetric) {
    const trendKey = buildTrendKey(nodeKey, metric);
    setTrendByKey((current) => ({
      ...current,
      [trendKey]: {
        rows: current[trendKey]?.rows ?? [],
        loading: true,
        error: null,
      },
    }));

    try {
      const params = new URLSearchParams({
        dimensions: orderedDimensions.join(","),
        metrics: metric,
        filterMode,
        path: path.join(","),
      });

      if (filterMode === "period") {
        params.set("fromDate", fromDate);
        params.set("toDate", toDate);
      } else {
        params.set("windowValue", String(windowValue));
        params.set("windowUnit", windowUnit);
      }

      const response = await fetch(`/api/admin/chart-trend?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Trend request failed with ${response.status}`);

      const payload = (await response.json()) as TrendApiResponse;
      setTrendByKey((current) => ({
        ...current,
        [trendKey]: {
          rows: payload.rows,
          loading: false,
          error: null,
        },
      }));
    } catch (requestError) {
      setTrendByKey((current) => ({
        ...current,
        [trendKey]: {
          rows: current[trendKey]?.rows ?? [],
          loading: false,
          error: requestError instanceof Error ? requestError.message : "Failed to load trend.",
        },
      }));
    }
  }

  async function fetchRawEvents(
    nextPage: number,
    nextPageSize: number,
    nextFilterMode: FilterMode,
    nextWindowValue: number,
    nextWindowUnit: WindowUnit,
    nextFromDate: string,
    nextToDate: string,
  ) {
    setRawLoading(true);
    setRawError(null);

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
        filterMode: nextFilterMode,
      });

      if (nextFilterMode === "period") {
        params.set("fromDate", nextFromDate);
        params.set("toDate", nextToDate);
      } else {
        params.set("windowValue", String(nextWindowValue));
        params.set("windowUnit", nextWindowUnit);
      }

      for (const dimension of orderedDimensions) {
        const value = (dimensionFilters[dimension] ?? "").trim();
        if (!value) continue;
        params.set(`df_${dimension}`, value);
      }

      for (const metric of selectedMetrics) {
        const minValue = (metricMinFilters[metric] ?? "").trim();
        if (!minValue) continue;
        params.set(`min_${metric}`, minValue);
      }

      const response = await fetch(`/api/admin/raw-events?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Raw events request failed with ${response.status}`);
      }

      const payload = (await response.json()) as RawEventsResponse;
      setRawRows(payload.rows);
      setRawTotal(payload.total);
      setRawPage(payload.page);
      setRawPageSize(payload.pageSize);
      setRawTotalPages(payload.totalPages);
    } catch (requestError) {
      setRawError(requestError instanceof Error ? requestError.message : "Failed to load raw events.");
    } finally {
      setRawLoading(false);
    }
  }

  async function fetchRawEventDetail(id: string) {
    setRawDetailLoading(true);
    setRawDetailError(null);
    setSelectedRawEvent(null);

    try {
      const response = await fetch(`/api/admin/raw-event?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Raw event request failed with ${response.status}`);
      }

      const payload = (await response.json()) as RawEventResponse;
      setSelectedRawEvent(payload.row);
    } catch (requestError) {
      setRawDetailError(requestError instanceof Error ? requestError.message : "Failed to load raw event detail.");
    } finally {
      setRawDetailLoading(false);
    }
  }

  function toggleMetric(metric: ChartMetric) {
    setSelectedMetrics((current) => {
      if (current.includes(metric)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== metric);
      }

      if (current.length >= 8) return current;
      return [...current, metric];
    });
  }

  function clampWindowValue(value: number, unit: WindowUnit) {
    const maxByUnit: Record<WindowUnit, number> = {
      minute: 1440,
      hour: 24 * 180,
      day: 365,
      month: 36,
    };

    if (!Number.isFinite(value)) return 1;
    return Math.min(Math.max(value, 1), maxByUnit[unit]);
  }

  function setDimensionFilter(dimension: ChartDimension, value: string) {
    setDimensionFilters((current) => {
      const next = { ...current };
      const normalized = value.trim();
      if (!normalized) {
        delete next[dimension];
      } else {
        next[dimension] = value;
      }
      return next;
    });
  }

  function setMetricMinFilter(metric: ChartMetric, value: string) {
    setMetricMinFilters((current) => {
      const next = { ...current };
      const normalized = value.trim();
      if (!normalized) {
        delete next[metric];
      } else {
        next[metric] = value;
      }
      return next;
    });
  }

  const filteredRows = useMemo(() => {
    if (!rows.length) return [];

    return rows.filter((row) => {
      for (let index = 0; index < orderedDimensions.length; index += 1) {
        const dimension = orderedDimensions[index];
        const filterValue = (dimensionFilters[dimension] ?? "").trim().toLowerCase();
        if (!filterValue) continue;

        const rowValue = String(row.path[index] ?? "unknown").toLowerCase();
        if (!rowValue.includes(filterValue)) return false;
      }

      for (const metric of selectedMetrics) {
        const minRaw = (metricMinFilters[metric] ?? "").trim();
        if (!minRaw) continue;

        const minValue = Number(minRaw);
        if (!Number.isFinite(minValue)) continue;

        const rowMetricValue = Number(row.metrics[metric] ?? 0);
        if (rowMetricValue < minValue) return false;
      }

      return true;
    });
  }, [rows, orderedDimensions, dimensionFilters, selectedMetrics, metricMinFilters]);

  const tree = useMemo(() => {
    if (!filteredRows.length || !selectedMetrics.length) return [];
    return buildTree(filteredRows, selectedMetrics);
  }, [filteredRows, selectedMetrics]);

  const allNodes = useMemo(() => collectNodes(tree), [tree]);

  const globalMetricMax = Math.max(
    ...allNodes.flatMap((node) => selectedMetrics.map((metric) => node.metrics[metric] ?? 0)),
    0,
  );

  const levelLabels = orderedDimensions.map((dimension) => CHART_DIMENSIONS[dimension]);
  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_40px_rgba(40,35,20,0.07)]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Chart lab</p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">Multi-level drill down</h2>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            Add or remove levels as needed and combine multiple metrics. Apply refreshes only this chart section without reloading the page.
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {levels.map((level, index) => (
              <div key={`level-${index}`} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-800">Level {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLevels((current) => {
                        if (current.length <= 1) return current;
                        return current.filter((_, itemIndex) => itemIndex !== index);
                      });
                    }}
                    disabled={levels.length <= 1}
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-stone-700 transition hover:border-stone-900 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>

                <select
                  value={level}
                  onChange={(event) => {
                    const value = event.target.value as ChartDimension;
                    setLevels((current) => {
                      const next = [...current];
                      next[index] = value;
                      return next;
                    });
                  }}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                >
                  {dimensionEntries.map(([value, label]) => (
                    <option key={`dimension-${index}-${value}`} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLevels((current) => {
                  if (current.length >= MAX_LEVELS) return current;
                  const fallback = DEFAULT_CHART_DIMENSIONS[current.length % DEFAULT_CHART_DIMENSIONS.length] ?? "provider";
                  return [...current, fallback];
                });
              }}
              disabled={levels.length >= MAX_LEVELS}
              className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-stone-800 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add level
            </button>
            <span className="text-xs text-stone-500">{levels.length}/{MAX_LEVELS} levels</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <p className="text-sm font-medium text-stone-800">Metrics (choose up to 8, at least 1)</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {metricGroups.map((group) => (
              <section key={group.title} className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{group.title}</p>
                <div className="mt-2 space-y-2">
                  {group.metrics.map((metric) => {
                    const checked = selectedMetrics.includes(metric);
                    return (
                      <label key={metric} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-[var(--surface-strong)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMetric(metric)}
                        />
                        <span>{CHART_METRICS[metric]}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-stone-800">Data filters (optional)</p>
            <button
              type="button"
              onClick={() => {
                setDimensionFilters({});
                setMetricMinFilters({});
              }}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
            >
              Clear filters
            </button>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--border)] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Level value contains</p>
              <div className="mt-2 space-y-2">
                {orderedDimensions.map((dimension) => (
                  <label key={`dimension-filter-${dimension}`} className="flex flex-col gap-1 text-xs text-stone-600">
                    <span>{CHART_DIMENSIONS[dimension]}</span>
                    <input
                      type="text"
                      value={dimensionFilters[dimension] ?? ""}
                      onChange={(event) => setDimensionFilter(dimension, event.target.value)}
                      placeholder={`Filter ${CHART_DIMENSIONS[dimension]}...`}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-stone-700"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Metric minimum value</p>
              <div className="mt-2 space-y-2">
                {selectedMetrics.map((metric) => (
                  <label key={`metric-filter-${metric}`} className="flex flex-col gap-1 text-xs text-stone-600">
                    <span>{CHART_METRICS[metric]}</span>
                    <input
                      type="number"
                      step="any"
                      value={metricMinFilters[metric] ?? ""}
                      onChange={(event) => setMetricMinFilter(metric, event.target.value)}
                      placeholder="Min value"
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-stone-700"
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>

          {rows.length ? (
            <p className="mt-3 text-xs text-stone-500">Showing {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} grouped rows after filters.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex w-full max-w-xs flex-col gap-1 text-sm text-stone-700">
            <span className="font-medium">Time mode</span>
            <select
              value={filterMode}
              onChange={(event) => {
                const nextMode = event.target.value as FilterMode;
                setFilterMode(nextMode);
              }}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2"
            >
              {filterModeEntries.map((item) => (
                <option key={`unit-${item.value}`} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          {filterMode === "rolling" ? (
            <>
              <label className="flex w-full max-w-xs flex-col gap-1 text-sm text-stone-700">
                <span className="font-medium">Window value</span>
                <input
                  type="number"
                  min={1}
                  value={windowValue}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value || "1", 10);
                    setWindowValue(clampWindowValue(next, windowUnit));
                  }}
                  className="rounded-xl border border-[var(--border)] bg-white px-3 py-2"
                />
              </label>

              <label className="flex w-full max-w-xs flex-col gap-1 text-sm text-stone-700">
                <span className="font-medium">Window unit</span>
                <select
                  value={windowUnit}
                  onChange={(event) => {
                    const unit = event.target.value as WindowUnit;
                    setWindowUnit(unit);
                    setWindowValue((current) => clampWindowValue(current, unit));
                  }}
                  className="rounded-xl border border-[var(--border)] bg-white px-3 py-2"
                >
                  {windowUnitEntries.map((item) => (
                    <option key={`rolling-unit-${item.value}`} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="flex w-full max-w-xs flex-col gap-1 text-sm text-stone-700">
                <span className="font-medium">From date</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-white px-3 py-2"
                />
              </label>

              <label className="flex w-full max-w-xs flex-col gap-1 text-sm text-stone-700">
                <span className="font-medium">To date</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-white px-3 py-2"
                />
              </label>

              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const range = getPeriodPreset("today");
                    setFromDate(range.fromDate);
                    setToDate(range.toDate);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const range = getPeriodPreset("yesterday");
                    setFromDate(range.fromDate);
                    setToDate(range.toDate);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const range = getPeriodPreset("last7");
                    setFromDate(range.fromDate);
                    setToDate(range.toDate);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const range = getPeriodPreset("thisMonth");
                    setFromDate(range.fromDate);
                    setToDate(range.toDate);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  This month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const range = getPeriodPreset("lastMonth");
                    setFromDate(range.fromDate);
                    setToDate(range.toDate);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  Last month
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              void fetchData(orderedDimensions, selectedMetrics, filterMode, windowValue, windowUnit, fromDate, toDate);
              void fetchRawEvents(1, rawPageSize, filterMode, windowValue, windowUnit, fromDate, toDate);
            }}
            disabled={loading || selectedMetrics.length === 0}
            className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Refreshing chart..." : "Apply settings"}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3" aria-live="polite">
        {selectedMetrics.length ? (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-3 text-xs text-stone-700">
            {selectedMetrics.map((metric) => (
              <span key={`legend-${metric}`} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${METRIC_BAR_STYLE[metric]}`} />
                {CHART_METRICS[metric]}
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}

        {!rows.length && !loading && !error ? (
          <div className="rounded-2xl bg-[var(--surface-strong)] px-4 py-4 text-sm text-stone-700">
            Chart is ready. Click Apply settings to load your drill-down.
          </div>
        ) : null}

        {!!rows.length && !filteredRows.length && !loading && !error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            No rows match the current filters. Adjust or clear filters to see data.
          </div>
        ) : null}

        {tree.map((node) => (
          <ChartNode
            key={node.key}
            node={node}
            metrics={selectedMetrics}
            globalMetricMax={globalMetricMax}
            levelLabels={levelLabels}
            trendByKey={trendByKey}
            onOpenCallDetail={(id) => {
              void fetchRawEventDetail(id);
            }}
            onSelectNode={(targetNode, metric) => {
              const trendKey = buildTrendKey(targetNode.key, metric);
              if (trendByKey[trendKey]) {
                setTrendByKey((current) => {
                  const next = { ...current };
                  delete next[trendKey];
                  return next;
                });
                return;
              }

              void fetchTrend(targetNode.key, targetNode.path, metric);
            }}
            onCloseTrend={(targetNode, metric) => {
              const trendKey = buildTrendKey(targetNode.key, metric);
              setTrendByKey((current) => {
                if (!current[trendKey]) return current;
                const next = { ...current };
                delete next[trendKey];
                return next;
              });
            }}
          />
        ))}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-500">Raw events</p>
              <p className="mt-1 text-sm text-stone-700">Raw table is below chart and collapsed by default.</p>
            </div>
            <button
              type="button"
              onClick={() => setRawExpanded((current) => !current)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
            >
              {rawExpanded ? "Collapse raw table" : "Expand raw table"}
            </button>
          </div>

          {rawExpanded ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <label className="flex items-center gap-2">
                  <span>Rows/page</span>
                  <select
                    value={rawPageSize}
                    onChange={(event) => {
                      const nextPageSize = Number.parseInt(event.target.value, 10) || 20;
                      void fetchRawEvents(1, nextPageSize, filterMode, windowValue, windowUnit, fromDate, toDate);
                    }}
                    className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs"
                  >
                    {[20, 50, 100].map((size) => (
                      <option key={`raw-size-${size}`} value={size}>{size}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void fetchRawEvents(rawPage, rawPageSize, filterMode, windowValue, windowUnit, fromDate, toDate)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  Refresh raw table
                </button>
              </div>

              {rawError ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{rawError}</p>
              ) : null}

              {rawLoading ? (
                <p className="mt-3 text-sm text-stone-600">Loading raw events...</p>
              ) : null}

              {!rawLoading && !rawError && !rawRows.length ? (
                <p className="mt-3 rounded-xl bg-[var(--surface-strong)] px-3 py-2 text-sm text-stone-600">No raw rows loaded yet. Click Apply settings or Refresh raw table.</p>
              ) : null}

              {!rawLoading && !rawError && rawRows.length ? (
                <>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
                    <table className="min-w-[2400px] border-collapse text-left text-xs text-stone-700">
                      <thead className="bg-[var(--surface-strong)] text-stone-600">
                        <tr>
                          {USAGE_EVENT_COLUMNS.map((column) => (
                            <th key={`raw-header-${column}`} className="px-3 py-2 font-medium whitespace-nowrap">
                              {humanizeColumnName(column)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.map((row, index) => {
                          const key = String(row.id ?? row.request_id ?? row.created_at ?? `row-${index}`);
                          return (
                            <tr key={`raw-${key}`} className="border-t border-[var(--border)]">
                              {USAGE_EVENT_COLUMNS.map((column) => {
                                const rawValue = row[column];
                                const cellText = formatRawCell(column, rawValue);
                                return (
                                  <td
                                    key={`raw-cell-${key}-${column}`}
                                    className="max-w-80 truncate px-3 py-2 font-mono text-[11px] text-stone-600"
                                    title={cellText}
                                  >
                                    {cellText}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                    <p>
                      Showing {Math.min((rawPage - 1) * rawPageSize + 1, rawTotal).toLocaleString()}-
                      {Math.min(rawPage * rawPageSize, rawTotal).toLocaleString()} of {rawTotal.toLocaleString()} rows
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={rawPage <= 1 || rawLoading}
                        onClick={() => void fetchRawEvents(rawPage - 1, rawPageSize, filterMode, windowValue, windowUnit, fromDate, toDate)}
                        className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <span>Page {rawPage} / {Math.max(rawTotalPages, 1)}</span>
                      <button
                        type="button"
                        disabled={rawPage >= rawTotalPages || rawLoading}
                        onClick={() => void fetchRawEvents(rawPage + 1, rawPageSize, filterMode, windowValue, windowUnit, fromDate, toDate)}
                        className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </section>

        {(rawDetailLoading || rawDetailError || selectedRawEvent) ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
            <section className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-stone-500">Modeling call detail</p>
                  <p className="text-sm text-stone-700">Full raw data for selected call</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRawEvent(null);
                    setRawDetailError(null);
                    setRawDetailLoading(false);
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-stone-700 transition hover:border-stone-900"
                >
                  Close
                </button>
              </div>

              {rawDetailLoading ? (
                <p className="px-4 py-4 text-sm text-stone-600">Loading raw event detail...</p>
              ) : null}

              {rawDetailError ? (
                <p className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{rawDetailError}</p>
              ) : null}

              {selectedRawEvent ? (
                <div className="max-h-[70vh] overflow-auto p-4">
                  <table className="w-full border-collapse text-left text-xs text-stone-700">
                    <thead className="sticky top-0 bg-[var(--surface-strong)] text-stone-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">Column</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {USAGE_EVENT_COLUMNS.map((column) => {
                        const value = formatRawCell(column, selectedRawEvent[column]);
                        return (
                          <tr key={`detail-${column}`} className="border-t border-[var(--border)]">
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-stone-600">{column}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-stone-800">{value}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}
