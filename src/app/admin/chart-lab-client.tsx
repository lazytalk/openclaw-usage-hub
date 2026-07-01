"use client";

import { useMemo, useState } from "react";
import {
  CHART_DIMENSIONS,
  CHART_METRICS,
  DEFAULT_CHART_DIMENSIONS,
  DEFAULT_CHART_METRICS,
  type ChartDimension,
  type ChartMetric,
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
  bucketUnit: "hour" | "day";
  dimensions: ChartDimension[];
  path: string[];
  metrics: ChartMetric[];
  rows: Array<{ bucket: string; metrics: Record<string, number> }>;
};

type TrendState = {
  rows: Array<{ bucket: string; metrics: Record<string, number> }>;
  bucketUnit: "hour" | "day";
  loading: boolean;
  error: string | null;
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
const metricEntries = Object.entries(CHART_METRICS) as Array<[ChartMetric, string]>;
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
  tool_call_count: "bg-violet-600",
  error_events: "bg-rose-600",
  success_events: "bg-green-700",
};

function formatMetric(metric: ChartMetric, value: number) {
  if (metric === "estimated_cost_usd") return `$${value.toFixed(4)}`;
  return Math.round(value).toLocaleString();
}

function formatTrendBucket(bucket: string, unit: "hour" | "day") {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;

  if (unit === "hour") {
    return `${date.toISOString().slice(5, 13).replace("T", " ")}:00`;
  }

  return date.toISOString().slice(0, 10);
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

function ChartNode({
  node,
  metrics,
  globalMetricMax,
  levelLabels,
  trendByKey,
  onSelectNode,
  onCloseTrend,
}: {
  node: TreeNode;
  metrics: ChartMetric[];
  globalMetricMax: number;
  levelLabels: string[];
  trendByKey: Record<string, TrendState>;
  onSelectNode: (node: TreeNode, metric: ChartMetric) => void;
  onCloseTrend: (node: TreeNode, metric: ChartMetric) => void;
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
          const trendBucketUnit = trendState?.bucketUnit ?? "day";
          const trendLoading = trendState?.loading ?? false;
          const trendError = trendState?.error ?? null;
          const trendMax = Math.max(...trendRows.map((row) => Number(row.metrics[metric] ?? 0)), 0);

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
                      <p className="text-xs text-stone-500">Granularity: {trendBucketUnit === "hour" ? "hourly" : "daily"}</p>
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
                    <div className="mt-3">
                      <div className="flex items-end gap-1 overflow-x-auto rounded-xl bg-[var(--surface-strong)] px-2 py-2">
                        {trendRows.map((row) => {
                          const trendValue = Number(row.metrics[metric] ?? 0);
                          const height = trendMax > 0 ? Math.max((trendValue / trendMax) * 100, 3) : 0;

                          return (
                            <div key={`trend-${node.key}-${metric}-${row.bucket}`} className="flex min-w-10 flex-col items-center gap-1" title={`${formatTrendBucket(row.bucket, trendBucketUnit)} | ${formatMetric(metric, trendValue)}`}>
                              <div className="flex h-24 items-end">
                                <div className={`w-4 rounded-sm ${METRIC_BAR_STYLE[metric]}`} style={{ height: `${height}%` }} />
                              </div>
                              <span className="font-mono text-[10px] text-stone-500">{formatTrendBucket(row.bucket, trendBucketUnit)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
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
        bucketUnit: current[trendKey]?.bucketUnit ?? "day",
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
          bucketUnit: payload.bucketUnit,
          loading: false,
          error: null,
        },
      }));
    } catch (requestError) {
      setTrendByKey((current) => ({
        ...current,
        [trendKey]: {
          rows: current[trendKey]?.rows ?? [],
          bucketUnit: current[trendKey]?.bucketUnit ?? "day",
          loading: false,
          error: requestError instanceof Error ? requestError.message : "Failed to load trend.",
        },
      }));
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

  const tree = useMemo(() => {
    if (!rows.length || !selectedMetrics.length) return [];
    return buildTree(rows, selectedMetrics);
  }, [rows, selectedMetrics]);

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
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {metricEntries.map(([metric, label]) => {
              const checked = selectedMetrics.includes(metric);
              return (
                <label key={metric} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMetric(metric)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
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
            onClick={() => fetchData(orderedDimensions, selectedMetrics, filterMode, windowValue, windowUnit, fromDate, toDate)}
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

        {tree.map((node) => (
          <ChartNode
            key={node.key}
            node={node}
            metrics={selectedMetrics}
            globalMetricMax={globalMetricMax}
            levelLabels={levelLabels}
            trendByKey={trendByKey}
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
      </div>
    </section>
  );
}
