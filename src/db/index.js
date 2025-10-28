import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

export const connectDB = async () => {
    try {
        const connection = await mongoose.connect(`${process.env.MONGODB_URL}${DB_NAME}?retryWrites=true&w=majority`, {
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