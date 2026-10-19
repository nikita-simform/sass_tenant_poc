import { SignJWT, jwtVerify } from "jose";
import { requireEnv } from "@/lib/env";

export type UserRole = "PLATFORM_ADMIN" | "ORG_ADMIN" | "ORG_MEMBER";

export type SessionClaims = {
  userId: string;
  role: UserRole;
  // null only for PLATFORM_ADMIN, who belongs to no organization.
  organizationId: string | null;
  schemaName: string | null;
};

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv("JWT_SECRET"));
}

const SESSION_TTL = "12h";

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return {
      userId: payload.userId,
      role: payload.role as UserRole,
      organizationId: (payload.organizationId as string | null) ?? null,
      schemaName: (payload.schemaName as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
