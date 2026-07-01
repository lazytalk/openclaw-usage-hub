import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { USAGE_EVENT_COLUMNS, type UsageEventColumn } from "@/lib/chart-options";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const selectSql = USAGE_EVENT_COLUMNS.map((column) => {
    if (column === "created_at" || column === "started_at" || column === "ended_at") {
      return `${column}::text AS ${column}`;
    }
    if (column === "tool_names_json" || column === "raw_usage_json" || column === "metadata_json") {
      return `${column}::text AS ${column}`;
    }
    return column;
  }).join(",\n      ");

  const sql = `
    SELECT
      ${selectSql}
    FROM usage_events
    WHERE id = $1
    LIMIT 1
  `;

  const result = await query<Record<UsageEventColumn, string | number | null>>(sql, [id]);
  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ row });
}
