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
  // Sessions are meant to last until the user signs out, so the default is effectively "never".
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "3650d",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  // Separate Cloudinary account for the ShineOne Estate website photos (Media tab).
  shineCloudName: process.env.CLOUDINARY_CLOUD_NAME_shine ?? "",
  shineApiKey: process.env.CLOUDINARY_API_KEY_shine ?? "",
  shineApiSecret: process.env.CLOUDINARY_API_SECRET_shine ?? "",
  cloudinaryFolder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? "tasks-app",
  // Google Apps Script web app that sends the email (see docs/apps-script-mailer.gs).
  mailWebhookUrl: process.env.MAIL_WEBHOOK_URL ?? "",
  mailWebhookSecret: process.env.MAIL_WEBHOOK_SECRET ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  mailFrom: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "",
  // SMS Service: the phones authenticate with SMS_DEVICE_KEY, the website console (ggnHome server) with SMS_CONSOLE_KEY.
  // Neither has a production default: unset means that part of the SMS API refuses every request.
  smsDeviceKey: process.env.SMS_DEVICE_KEY ?? (process.env.NODE_ENV === "production" ? "" : "test123"),
  smsConsoleKey: process.env.SMS_CONSOLE_KEY ?? (process.env.NODE_ENV === "production" ? "" : "console-test"),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  adminMobileNumbers: (
    process.env.NODE_ENV === "production"
      ? required("ADMIN_MOBILE_NUMBERS")
      : process.env.ADMIN_MOBILE_NUMBERS ?? ""
  )
    .split(",")
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim())
    // The leads admin is always an admin, whatever the deployment's env says.
    .concat(["8130483894"])
    .filter((s, i, all) => all.indexOf(s) === i),
};

export const isProduction = env.nodeEnv === "production";
