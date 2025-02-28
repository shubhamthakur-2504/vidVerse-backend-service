import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

export const connectDB = async () => {
    try {
        const connection = await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`);
        console.log(`db: mongoose connected to ${connection.connection.host}`);
    } catch (error) {
        console.log("db: mongoose connection error::", error);
        process.exit(1);
    }
}