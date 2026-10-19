import { z } from "zod";

export const createResourceSchema = z.object({
  name: z.string().trim().min(1).max(300),
  content: z.string().max(50_000).optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    content: z.string().max(50_000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

// Allowlisted sort fields only — never interpolate a client-supplied field
// name directly into an ORDER BY.
const SORTABLE_FIELDS = ["createdAt", "name", "sizeBytes"] as const;

export const listResourceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(SORTABLE_FIELDS).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().max(200).optional(),
});
export type ListResourceQuery = z.infer<typeof listResourceQuerySchema>;
