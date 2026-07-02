import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  await clearSessionCookie();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}
