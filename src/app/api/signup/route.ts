import { NextResponse, type NextRequest } from "next/server";
import { onboardOrganization } from "@/lib/services/onboarding";
import { attachSessionCookie } from "@/lib/auth/session";
import { signupSchema } from "@/lib/validation/auth";
import { parseOrThrow } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/middleware/errorHandler";

// The one intentionally anonymous path in this system (see README /
// POC spec §6) — every other route requires an authenticated session.
export async function POST(request: NextRequest) {
  try {
    const body = parseOrThrow(signupSchema, await request.json());
    const result = await onboardOrganization(body);

    const response = NextResponse.json(
      {
        organizationId: result.organizationId,
        organizationName: result.organizationName,
        adminEmail: result.adminEmail,
      },
      { status: 201 },
    );

    return attachSessionCookie(response, {
      userId: result.adminUserId,
      role: "ORG_ADMIN",
      organizationId: result.organizationId,
      schemaName: result.schemaName,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
