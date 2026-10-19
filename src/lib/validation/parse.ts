import type { ZodType } from "zod";
import { ValidationError } from "@/lib/errors";

// All validation happens here, before any service/business logic runs — a
// malformed body/query never reaches a database query.
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ValidationError(message);
  }
  return result.data;
}
