/* eslint-disable no-console */
type LogFields = Record<string, unknown>;

function format(level: string, message: string, fields?: LogFields): string {
  const base = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  return fields ? `${base} ${JSON.stringify(fields)}` : base;
}

export const logger = {
  info(message: string, fields?: LogFields) {
    console.log(format("info", message, fields));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(format("warn", message, fields));
  },
  error(message: string, fields?: LogFields) {
    console.error(format("error", message, fields));
  },
};
