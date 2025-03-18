import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const commentSchema = new Schema({
    content:{
        type:String,
        required:true
    },
    videoId:{
        type:Schema.Types.ObjectId,
        ref:"Video"
    },
    tweetId:{
        type:Schema.Types.ObjectId,
        ref:"Tweet"
    },
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamps:true});

commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model("Comment",commentSchema);