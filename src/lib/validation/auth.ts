import { z } from "zod";

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2).max(200),
  planName: z.string().trim().min(1).max(100),
  adminEmail: z.string().trim().toLowerCase().pipe(z.email()),
  adminPassword: z.string().min(8).max(200),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
