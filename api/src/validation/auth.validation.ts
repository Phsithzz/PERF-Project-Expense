import { z } from 'zod';

const clientTypeSchema = z.enum(['web', 'mobile']);
const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => value === value.trim(), 'Name must not have surrounding whitespace'),
    email: emailSchema,
    password: z.string().min(12).max(128),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    clientType: clientTypeSchema,
  })
  .strict();

const webRefreshRequestSchema = z
  .object({
    clientType: z.literal('web'),
  })
  .strict();

const mobileRefreshRequestSchema = z
  .object({
    clientType: z.literal('mobile'),
    refreshToken: z.string().min(32).max(2048),
  })
  .strict();

export const refreshCredentialRequestSchema = z.discriminatedUnion('clientType', [
  webRefreshRequestSchema,
  mobileRefreshRequestSchema,
]);

export type ClientType = z.infer<typeof clientTypeSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshCredentialRequest = z.infer<typeof refreshCredentialRequestSchema>;
