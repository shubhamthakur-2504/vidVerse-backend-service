import mongoose, {Schema} from "mongoose";

const likeSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        required:true,
        ref:"User",
    },
    targetId:{
        type:Schema.Types.ObjectId,
        required:true,
    },
    targetType:{
        type:String,
        enum:["Video","Tweet","Comment"],
        required:true
    },
    islike:{
        type:Boolean,
        default:true
    }
},{timestamps:true});

likeSchema.index({userId:1,targetId:1,targetType:1},{unique:true});
likeSchema.index({targetId:1,targetType:1,islike:1});
likeSchema.index({targetId:1,targetType:1});

export const Like = mongoose.model("Like",likeSchema);