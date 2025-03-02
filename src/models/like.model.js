import mongoose, {Schema} from "mongoose";

const likeSchema = new Schema({
    videoId:{
        type:Schema.Types.ObjectId,
        ref:"Video"
    },
    commentId:{
        type:Schema.Types.ObjectId,
        ref:"Comment"
    },
    tweetId:{
        type:Schema.Types.ObjectId,
        ref:"Tweet"
    }
},{timestamps:true});

export const Like = mongoose.model("Like",likeSchema);