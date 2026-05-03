/**
 * Server entrypoint. PORT is injected by the Replit workflow runner — the
 * value differs between dev and production but the binary doesn't care.
 * See artifacts/api-server/.replit-artifact/artifact.toml for how the
 * shared reverse proxy maps localhost:PORT → /api.
 */
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
