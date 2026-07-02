import { NextResponse } from "next/server";
import { createSession, setSessionCookie, verifyAdminPassword } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const { ADMIN_USERNAME } = getEnv();

  if (username !== ADMIN_USERNAME || !(await verifyAdminPassword(password))) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/login?error=invalid" },
    });
  }

  const token = await createSession(username);
  await setSessionCookie(token);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/admin" },
  });
}
