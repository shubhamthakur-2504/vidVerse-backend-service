import mongoose, {Schema} from "mongoose";

const subscriptionSchema = Schema({
    subscriber:{
        type: Schema.Types.ObjectId,
        index:true,
        ref:"User"
    },
    channel:{
        type:Schema.Types.ObjectId,
        index:true,
        ref:"User"
    }
},{timestamps:true})

subscriptionSchema.index({subscriber:1,channel:1},{unique:true})
// "my subscriptions", newest first (cursor: createdAt + _id)
subscriptionSchema.index({subscriber:1,createdAt:-1,_id:-1})

export const Subscription = mongoose.model("Subscribe",subscriptionSchema);