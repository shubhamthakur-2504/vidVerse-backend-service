import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

//import Routes
import healthCheckRouter from './routes/healthCheck.routes.js';
import userRouter from './routes/userRegister.routes.js';
import videoRouter from './routes/video.routes.js';
import tweetRouter from './routes/tweet.routes.js'
import PlayListRouter from './routes/playList.routes.js';

const app = express();

//cors
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials:true
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
app.use("/api/v1/videos/playlist",PlayListRouter);
app.use("/api/v1/videos/save",PlayListRouter);


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