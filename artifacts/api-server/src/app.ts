/**
 * Express application factory.
 *
 * Middleware order is significant:
 *   1. pino-http             — request logging (every later handler can use req.log)
 *   2. clerkProxyMiddleware  — production-only Clerk Frontend API proxy.
 *                              MUST be before express.json() because it
 *                              streams the proxied body untouched.
 *   3. cors / cookieParser / express.json — standard parsers
 *   4. clerkMiddleware       — populates req.auth from session cookie/JWT
 *   5. /api router           — feature handlers; each wraps requireAuth
 *                              individually rather than mounting it here so
 *                              health checks remain anonymous.
 *
 * The Clerk publishable key is derived per-request from the proxied host so
 * the same binary can serve multiple custom domains / Replit deployments
 * without env-var changes — see middlewares/clerkProxyMiddleware.ts.
 */
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
