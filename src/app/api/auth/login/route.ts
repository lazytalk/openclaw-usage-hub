import { NextResponse } from "next/server";
import { createSession, setSessionCookie, verifyAdminPassword } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const { ADMIN_USERNAME } = getEnv();

  if (username !== ADMIN_USERNAME || !(await verifyAdminPassword(password))) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }

  const token = await createSession(username);
  await setSessionCookie(token);
  return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
}
