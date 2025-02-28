import mongoose, {Schema} from "mongoose";

const videoSchema = new Schema({
    videoFileUrl:{
        type:String,
        required:true
    },
    thumbnailUrl:{
        type:String,
        required:true
    },
    title:{
        type:String,
        required:true
    },
    description:{
        type:String,
    },
    views:{
        type:Number,
        default:0
    },
    duration:{
        type:Number,
        required:true
    },
    isPublished:{
        type:Boolean,
        default:true
    },
    owner:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    }   
},{timestamps:true})

export const Video = mongoose.model("Video",videoSchema)