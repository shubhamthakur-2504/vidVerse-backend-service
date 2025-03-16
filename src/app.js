import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

//import Routes
import healthCheckRouter from './routes/healthCheck.routes.js';
import userRouter from './routes/userRegister.routes.js';
import videoRouter from './routes/video.routes.js';

const app = express();

//cors
app.use(cors({
    origin:"process.env.CLIENT_URL",
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

export {app};