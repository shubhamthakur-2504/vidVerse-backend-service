import Agenda from "agenda";
import { AJ_DB_NAME } from "../constants.js";
const agenda = new Agenda({
    db: {address:`${process.env.MONGODB_URL}${AJ_DB_NAME}`}
})
export default agenda;