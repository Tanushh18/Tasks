import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? "",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  jwtAccessSecret: required(
    "JWT_ACCESS_SECRET",
    process.env.NODE_ENV === "production" ? undefined : "dev-access-secret-change-me"
  ),
  jwtRefreshSecret: required(
    "JWT_REFRESH_SECRET",
    process.env.NODE_ENV === "production" ? undefined : "dev-refresh-secret-change-me"
  ),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
};

export const isProduction = env.nodeEnv === "production";
