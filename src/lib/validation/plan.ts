import { z } from "zod";

export const changePlanSchema = z.object({
  planName: z.string().trim().min(1).max(100),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
