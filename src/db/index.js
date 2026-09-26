import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { mongoUrlFor } from "../config.js";
import { logger } from "../utils/logger.js";

export const connectDB = async () => {
    try {
        const mongoUrl = mongoUrlFor(DB_NAME);

        const connection = await mongoose.connect(mongoUrl, {
            ssl: true,
            tls: true,
            tlsInsecure: false,
            serverSelectionTimeoutMS: 30000,
        });
        logger.info({ host: connection.connection.host, db: connection.connection.db.databaseName }, "mongodb connected")

    } catch (error) {
        logger.fatal({ err: error }, "mongodb connection failed")
        process.exit(1);
    }
}