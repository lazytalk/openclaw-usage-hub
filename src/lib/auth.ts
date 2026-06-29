import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";

const SESSION_COOKIE = "usage_hub_session";

function secretKey() {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export async function verifyAdminPassword(password: string) {
  const { ADMIN_PASSWORD_HASH } = getEnv();
  return bcrypt.compare(password, ADMIN_PASSWORD_HASH);
}

export async function createSession(username: string) {
  return new SignJWT({ sub: username, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, secretKey());
    const subject = verified.payload.sub;
    if (!subject) return null;
    return { username: subject };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
