import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import type { SessionClaims } from "@/lib/auth/jwt";
import { UnauthorizedError } from "@/lib/errors";
import { toErrorResponse } from "./errorHandler";

type AuthedHandler<Ctx> = (
  request: NextRequest,
  ctx: Ctx,
  session: SessionClaims,
) => Promise<Response>;

// Wraps a route handler so it only ever runs for a real, authenticated user —
// there is no anonymous path through this wrapper. Session claims always come
// from the verified JWT cookie, never from a client-supplied header/param.
export function withAuth<Ctx>(handler: AuthedHandler<Ctx>) {
  return async (request: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const session = await getSessionFromRequest(request);
      if (!session) {
        throw new UnauthorizedError();
      }
      return await handler(request, ctx, session);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
