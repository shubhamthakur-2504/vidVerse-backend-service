import dotenv from "dotenv";
import { app } from "./app.js";
import { connectDB } from "./db/index.js";
import agenda from "./db/agendaSetup.js";
import './utils/agendaJobs.js';
dotenv.config({
    path: "./.env"
});
const PORT = process.env.PORT || 3000

connectDB().then(async () => {
    await agenda.start();
    console.log("Agenda started successfully");

    // start the agenda jobs
    agenda.every("5 minutes", "count views")


    // start the express server
    app.listen(PORT, () => {
        console.log(`server is running on port ${PORT}`);
    })
}).catch((error) => {
    console.log("src: mongoose connection error::", error);
})
process.on("SIGTERM", async () => {
    await agenda.stop();
    console.log("Agenda gracefully stopped");
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
    process.exit(0);
});
process.on("SIGINT", async () => {
    await agenda.stop();
    console.log("Agenda stopped via SIGINT");
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
    process.exit(0);
});