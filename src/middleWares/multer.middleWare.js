import multer from "multer";
import {v4 as uuidv4} from "uuid";
import path from "path";

const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null, "./public/temps");
    },
    filename: function (req, file, cb){
        const extName = path.extname(file.originalname);
        const fileName =`${uuidv4()}${extName}`
        cb(null, fileName)
    }
})

export const upload = multer({storage:storage})