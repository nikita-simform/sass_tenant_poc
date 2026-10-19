import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "@/lib/services/auth";
import { attachSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { parseOrThrow } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/middleware/errorHandler";

export async function POST(request: NextRequest) {
  try {
    const body = parseOrThrow(loginSchema, await request.json());
    const session = await authenticate(body);
    const response = NextResponse.json({ role: session.role, organizationId: session.organizationId });
    return attachSessionCookie(response, session);
  } catch (error) {
    return toErrorResponse(error);
  }
}
