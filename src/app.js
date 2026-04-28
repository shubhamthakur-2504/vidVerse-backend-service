import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

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


// error handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        statusCode,
        message: err.message || "Internal Server Error",
        errors: err.errors || [],
    });
});

export {app};