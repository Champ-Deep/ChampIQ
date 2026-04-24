import { z } from 'zod';

export const ConfigSchema = z.object({
  providers: z.object({
    elevenlabs: z.object({
      api_key: z.string().min(1),
      agent_id: z.string().min(1),
      phone_number_id: z.string().min(1),
      webhook_secret: z.string().optional(),
    }).optional(),
  }).default({}),

  canvas: z.object({
    webhook_url: z.string().url(),
    webhook_secret: z.string().optional(),
  }).optional(),

  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
    ttl_days: z.number().int().positive().default(30),
  }).default({ url: 'redis://localhost:6379', ttl_days: 30 }),

  gateway: z.object({
    port: z.number().int().positive().default(3001),
    api_key: z.string().optional(),
    default_provider: z.string().default('elevenlabs'),
    public_url: z.string().url().optional(),
  }).default({ port: 3001, default_provider: 'elevenlabs' }),

  graph: z.object({
    inject_prev_context: z.boolean().default(true),
    max_context_calls: z.number().int().positive().default(3),
  }).default({ inject_prev_context: true, max_context_calls: 3 }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ElevenLabsConfig = NonNullable<Config['providers']['elevenlabs']>;
export type CanvasConfig = NonNullable<Config['canvas']>;
