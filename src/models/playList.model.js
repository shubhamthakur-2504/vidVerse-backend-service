import mongoose, {Schema} from "mongoose";

const playListSchema = new Schema({
    title:{
        type:String,
        required:true
    },
    description:{
        type:String,
    },
    thumbnailUrl:{
        type:String,
        required:true
    },
    videos:[{
        type:Schema.Types.ObjectId,
        ref:"Video"
    }],
    ownerId:{
        type:Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamps:true});

export const PlayList = mongoose.model("PlayList",playListSchema);