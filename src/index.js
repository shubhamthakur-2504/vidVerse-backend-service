import { config } from "./config.js";
import { app } from "./app.js";
import { connectDB } from "./db/index.js";
import agenda from "./db/agendaSetup.js";
import mongoose from "mongoose";
import "./utils/agendaJobs.js";
import { logger } from "./utils/logger.js";

const PORT = config.port;
let server;

connectDB()
    .then(async () => {
        await agenda.start();
        logger.info("agenda started");

        // start the agenda jobs
        agenda.every("5 minutes", "count views");

        // start the express server
        server = app.listen(PORT, () => {
            logger.info({ port: PORT, env: config.env }, "server listening");
        });
    })
    .catch((error) => {
        logger.fatal({ err: error }, "startup failed");
        process.exit(1);
    });

// stop accepting requests, let running jobs unlock, then close the database
const shutdown = async (signal) => {
    logger.info({ signal }, "shutting down");
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    await agenda.stop();
    await mongoose.connection.close();
    logger.info("shutdown complete");
    process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
