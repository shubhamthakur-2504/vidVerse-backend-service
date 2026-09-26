import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { mongoUrlFor } from "../config.js";

export const connectDB = async () => {
    try {
        const mongoUrl = mongoUrlFor(DB_NAME);

        const connection = await mongoose.connect(mongoUrl, {
            ssl: true,
            tls: true,
            tlsInsecure: false,
            serverSelectionTimeoutMS: 30000,
        });
        console.log(`db: mongoose connected to ${connection.connection.host}`);
        console.log(`db: mongoose connected to ${connection.connection.db.databaseName}`);

    } catch (error) {
        console.log("db: mongoose connection error::", error);
        process.exit(1);
    }
}