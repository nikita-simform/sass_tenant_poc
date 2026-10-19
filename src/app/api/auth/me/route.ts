import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware/withAuth";

export const GET = withAuth(async (_request, _ctx, session) => {
  return NextResponse.json(session);
});
