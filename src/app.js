import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import multer from 'multer';
import { apiError } from './utils/apiError.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'crypto';
import helmet from 'helmet';

//import Routes
import healthCheckRouter from './routes/healthCheck.routes.js';
import userRouter from './routes/userRegister.routes.js';
import videoRouter from './routes/video.routes.js';
import tweetRouter from './routes/tweet.routes.js'
import playListRouter from './routes/playList.routes.js';
import subscriptionRouter from './routes/subscription.routes.js';
import reaction from './routes/like.routes.js';
import { apiLimiter } from './middleWares/rateLimit.middleWare.js';

const app = express();

// only trust X-Forwarded-For from proxies we actually run behind; `true` would let any client spoof req.ip
// TRUST_PROXY: unset = no proxy, a number = hops (e.g. 1 behind one load balancer), or an express value like "loopback"
app.set('trust proxy', config.trustProxy);

// one log line per request with a request id (also returned as X-Request-Id); req.log carries the id into handlers
app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
        const id = req.headers["x-request-id"] || randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
    },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    autoLogging: { ignore: (req) => req.url === "/api/v1/healthcheck" },
}));

// security headers (nosniff, HSTS, frameguard, no x-powered-by, ...); the API only serves JSON, so the defaults fit
app.use(helmet());

// CORS: support multiple origins from env (comma-separated)
const allowedOrigins = config.clientUrls;
app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            return callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));


//common middleware
app.use(express.json({limit:'20kb'}));
app.use(express.urlencoded({extended:true,limit:'20kb'}));
// public/ only holds public/temps (in-flight uploads, thumbnails, HLS work files) — never serve it
app.use(cookieParser());

//routes
app.use("/api", apiLimiter);
app.use("/api/v1/healthcheck",healthCheckRouter);
app.use("/api/v1/user",userRouter);
app.use("/api/v1/videos",videoRouter);
app.use("/api/v1/tweets",tweetRouter);
app.use("/api/v1/videos/creatorplaylist",playListRouter);
app.use("/api/v1/videos/userplaylist",playListRouter);
app.use("/api/v1/subscription",subscriptionRouter);
app.use("/api/v1/reaction",reaction);


// map known library errors to client errors; anything else unexpected is a 500
const normalizeError = (err, log) => {
    if (err instanceof apiError) {
        return { statusCode: err.statusCode, message: err.message, errors: err.errors || [] }
    }
    if (err instanceof mongoose.Error.ValidationError) {
        return { statusCode: 400, message: "Validation failed", errors: Object.values(err.errors).map(e => e.message) }
    }
    if (err instanceof mongoose.Error.CastError || err?.name === "BSONError") {
        return { statusCode: 400, message: "Invalid id or value", errors: [] }
    }
    if (err?.code === 11000) {
        return { statusCode: 409, message: `${Object.keys(err.keyValue || {}).join(", ") || "Resource"} already exists`, errors: [] }
    }
    if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
        return { statusCode: 401, message: "Invalid or expired token", errors: [] }
    }
    if (err instanceof multer.MulterError) {
        return { statusCode: err.code === "LIMIT_FILE_SIZE" ? 413 : 400, message: err.message, errors: [] }
    }
    if (err?.type === "entity.parse.failed") {
        return { statusCode: 400, message: "Malformed JSON body", errors: [] }
    }
    if (err?.message === "Not allowed by CORS") {
        return { statusCode: 403, message: err.message, errors: [] }
    }
    if (err?.type === "entity.too.large") {
        return { statusCode: 413, message: "Request body too large", errors: [] }
    }
    // unexpected error: log the details, never send internals to the client
    log.error({ err }, "unhandled error")
    return { statusCode: 500, message: "Internal Server Error", errors: [] }
}

// error handler
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    const { statusCode, message, errors } = normalizeError(err, req.log ?? logger);
    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        errors,
    });
});

export {app};