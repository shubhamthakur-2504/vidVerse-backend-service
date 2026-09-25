import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import multer from 'multer';
import { apiError } from './utils/apiError.js';

//import Routes
import healthCheckRouter from './routes/healthCheck.routes.js';
import userRouter from './routes/userRegister.routes.js';
import videoRouter from './routes/video.routes.js';
import tweetRouter from './routes/tweet.routes.js'
import playListRouter from './routes/playList.routes.js';
import subscriptionRouter from './routes/subscription.routes.js';
import reaction from './routes/like.routes.js';

const app = express();

app.set('trust proxy', true);
// CORS: support multiple origins from env (comma-separated)
const allowedOrigins = process.env.CLIENT_URLS
    ? process.env.CLIENT_URLS.split(',').map(url => url.trim())
    : [];
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
app.use(express.static('public'));
app.use(cookieParser());

//routes
app.use("/api/v1/healthcheck",healthCheckRouter);
app.use("/api/v1/user",userRouter);
app.use("/api/v1/videos",videoRouter);
app.use("/api/v1/tweets",tweetRouter);
app.use("/api/v1/videos/creatorplaylist",playListRouter);
app.use("/api/v1/videos/userplaylist",playListRouter);
app.use("/api/v1/subscription",subscriptionRouter);
app.use("/api/v1/reaction",reaction);


// map known library errors to client errors; anything else unexpected is a 500
const normalizeError = (err) => {
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
    console.error("Unhandled error:", err); //to be removed after adding logs logger
    return { statusCode: 500, message: "Internal Server Error", errors: [] }
}

// error handler
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    const { statusCode, message, errors } = normalizeError(err);
    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        errors,
    });
});

export {app};