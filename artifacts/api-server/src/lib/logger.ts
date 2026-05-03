/**
 * Singleton pino logger.
 *
 * Use `req.log` inside HTTP handlers (pino-http attaches a request-scoped
 * child logger with the request id). Use this `logger` import only from
 * non-request code (bootstrapping in index.ts, scheduled jobs, etc.).
 *
 * NEVER use `console.log` on the server — it bypasses redaction and the
 * structured-log shape the workflows pane expects. Authorization headers
 * and cookies are redacted below to avoid leaking secrets into logs.
 */
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
