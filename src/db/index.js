import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

export const connectDB = async () => {
    try {
        const rawUrl = (process.env.MONGODB_URL || '').trim();
        if (!rawUrl) {
            throw new Error('MONGODB_URL is not defined in environment');
        }

        const [base, query] = rawUrl.split('?');
        const cleanedBase = base.replace(/\/?$/, '');
        const mongoUrl = `${cleanedBase}/${DB_NAME}${query ? `?${query}` : ''}`;

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