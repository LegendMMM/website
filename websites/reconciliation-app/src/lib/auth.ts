import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import type { Locale, Role, User } from "@prisma/client";

const COOKIE_NAME = "reconcile_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
};

function sessionSecret() {
  const secret =
    process.env.SESSION_SECRET ??
    "development-only-session-secret-change-before-deploy";
  return new TextEncoder().encode(secret);
}

export async function createSession(user: Pick<User, "id" | "email" | "name" | "role" | "locale">) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, sessionSecret());
    const payload = verified.payload;

    if (!verified.payload.sub || !payload.email || !payload.name || !payload.role || !payload.locale) {
      return null;
    }

    return {
      id: verified.payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      locale: payload.locale as Locale,
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export function assertAdmin(session: SessionUser) {
  if (session.role !== "ADMIN") {
    throw new Error("管理員權限不足");
  }
}
