import { inject, beforeAll, afterEach, afterAll } from "vitest";
import mongoose from "mongoose";

// env must be in place before any app module is imported by a test file
process.env.NODE_ENV = "test";
process.env.MONGODB_URL = inject("mongoUri");
process.env.CLIENT_URLS = "http://localhost:3000";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_TOKEN_EXPIRY = "15m";
process.env.JWT_REFRESH_TOKEN_EXPIRY = "7d";
process.env.JWT_COOKIE_EXPIRY = "7";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";

beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URL, { dbName: "vidverse-test" });
});

afterEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
    await mongoose.disconnect();
});
