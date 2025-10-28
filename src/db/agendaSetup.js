import Agenda from "agenda";
import { AJ_DB_NAME } from "../constants.js";
const agenda = new Agenda({
    db: {address:`${process.env.MONGODB_URL}${AJ_DB_NAME}?retryWrites=true&w=majority`}
})
export default agenda;