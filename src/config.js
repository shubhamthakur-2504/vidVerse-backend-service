import dotenv from "dotenv";
import { z } from "zod";

// the single place that reads the environment: loaded and validated once, before anything else uses it.
// importing this module (directly or through any module that uses config) is what loads .env,
// so there is no ordering problem with ESM import hoisting.
// tests provide their own values and must never pick up the real .env (dotenv fills in any variable they leave unset)
if (process.env.NODE_ENV !== "test") {
    dotenv.config({ path: "./.env", quiet: true });
}

const required = (name) => z.string({ error: `${name} is required` }).trim().min(1, `${name} is required`);
const positiveNumber = (fallback) => z.coerce.number().positive().default(fallback);

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    // comma-separated list of allowed browser origins
    CLIENT_URLS: z.string().default(""),
    MONGODB_URL: required("MONGODB_URL"),

    JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
    JWT_ACCESS_TOKEN_EXPIRY: z.string().trim().min(1).default("15m"),
    JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
    JWT_REFRESH_TOKEN_EXPIRY: z.string().trim().min(1).default("7d"),
    // lifetime of the auth cookies, in days
    JWT_COOKIE_EXPIRY: positiveNumber(7),

    CLOUDINARY_CLOUD_NAME: required("CLOUDINARY_CLOUD_NAME"),
    CLOUDINARY_API_KEY: required("CLOUDINARY_API_KEY"),
    CLOUDINARY_API_SECRET: required("CLOUDINARY_API_SECRET"),

    // proxy hops in front of the API: unset = none, a number = hops, or an express value like "loopback"
    TRUST_PROXY: z.string().trim().optional(),

    MAX_IMAGE_SIZE_MB: positiveNumber(10),
    MAX_VIDEO_SIZE_MB: positiveNumber(500),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.sample for the expected variables.`);
}
const env = parsed.data;

const MB = 1024 * 1024;

export const config = Object.freeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isDevelopment: env.NODE_ENV === "development",
    port: env.PORT,
    clientUrls: env.CLIENT_URLS.split(",").map((url) => url.trim()).filter(Boolean),
    mongodbUrl: env.MONGODB_URL,
    trustProxy: !env.TRUST_PROXY ? false : /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY,
    jwt: Object.freeze({
        accessSecret: env.JWT_ACCESS_SECRET,
        accessExpiry: env.JWT_ACCESS_TOKEN_EXPIRY,
        refreshSecret: env.JWT_REFRESH_SECRET,
        refreshExpiry: env.JWT_REFRESH_TOKEN_EXPIRY,
        cookieExpiryMs: env.JWT_COOKIE_EXPIRY * 24 * 60 * 60 * 1000,
    }),
    cloudinary: Object.freeze({
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
    }),
    uploads: Object.freeze({
        // whole bytes: busboy detects the limit with an exact equality, so a fractional limit would never trigger
        maxImageBytes: Math.floor(env.MAX_IMAGE_SIZE_MB * MB),
        maxVideoBytes: Math.floor(env.MAX_VIDEO_SIZE_MB * MB),
    }),
});

// build "<base>/<dbName>?<query>" from a MONGODB_URL with or without a trailing slash or query string
export const mongoUrlFor = (dbName) => {
    const [base, query] = config.mongodbUrl.split("?");
    return `${base.replace(/\/?$/, "")}/${dbName}${query ? `?${query}` : ""}`;
};
