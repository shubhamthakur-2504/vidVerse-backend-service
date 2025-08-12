import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import { type } from "os";

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
    status:{
        type:String,
        enum:["processing","ready","failed"],
        default:"processing"
    },
    owner:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    }   
},{timestamps:true})

videoSchema.plugin(mongooseAggregatePaginate)

export const Video = mongoose.model("Video",videoSchema)