import { z } from "zod";

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(["ORG_ADMIN", "ORG_MEMBER"]),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const changeUserRoleSchema = z.object({
  role: z.enum(["ORG_ADMIN", "ORG_MEMBER"]),
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
