import pino from "pino";
import { config } from "../config.js";

// JSON lines in production (for a log collector), readable output in development, silent in tests.
// log errors as logger.error({ err, ...context }, "what failed") so pino keeps the stack trace.
export const logger = pino({
    level: config.logLevel,
    redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
        censor: "[redacted]",
    },
    ...(config.isDevelopment && {
        transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
    }),
});
