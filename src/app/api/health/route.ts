import { NextResponse } from "next/server";
import { getDatabaseHealth } from "@/lib/db";

export async function GET() {
  try {
    const database = await getDatabaseHealth();
    return NextResponse.json({ ok: true, database });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 500 },
    );
  }
}
