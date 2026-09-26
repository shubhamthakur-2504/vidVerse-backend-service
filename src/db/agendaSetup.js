import Agenda from "agenda";
import { AJ_DB_NAME } from "../constants.js";
import { mongoUrlFor } from "../config.js";

const agenda = new Agenda({
    db: {address: mongoUrlFor(AJ_DB_NAME)}
})
export default agenda;
