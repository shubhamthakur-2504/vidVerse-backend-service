import express from 'express';
import cors from 'cors';
const app = express();

//import Routes
import healthCheckRouter from './routes/healthCheck.routes.js';

//cors
app.use(cors({
    origin:"process.env.CLIENT_URL",
    credentials:true
}));


//common middleware
app.use(express.json({limit:'20kb'}));
app.use(express.urlencoded({extended:true,limit:'20kb'}));
app.use(express.static('public'));

//routes
app.use("/api/v1/healthcheck",healthCheckRouter);

export {app};