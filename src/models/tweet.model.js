import mongoose, {Schema} from "mongoose";

const  tweetSchema = new Schema({
    content:{
        type:String,
        required:true
    },
    image:{
        type:String
    },
    owner:{
        type:Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamps:true});

// feed newest first (cursor: createdAt + _id) and a user's own tweets
tweetSchema.index({ createdAt: -1, _id: -1 });
tweetSchema.index({ owner: 1, createdAt: -1 });

export const Tweet = mongoose.model("Tweet",tweetSchema);