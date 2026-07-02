import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  INGEST_API_KEY: z.string().min(16),
  AUTH_SECRET: z.string().min(16),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return process.env.NODE_ENV === "production";
      return value.toLowerCase() === "true";
    }),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("OpenClaw Usage Hub"),
});

let cachedEnv: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}
