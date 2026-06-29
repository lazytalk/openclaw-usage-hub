import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { upsertUsageEvents, usageEventBatchSchema, usageEventSchema } from "@/lib/usage-event";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return token && token === getEnv().INGEST_API_KEY;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const events = Array.isArray(payload)
      ? payload.map((event) => usageEventSchema.parse(event))
      : payload?.events
        ? usageEventBatchSchema.parse(payload).events
        : [usageEventSchema.parse(payload)];

    const normalized = await upsertUsageEvents(events);
    return NextResponse.json({ ok: true, received: events.length, stored: normalized.length, ids: normalized.map((event) => event.id) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid ingest payload",
      },
      { status: 400 },
    );
  }
}
