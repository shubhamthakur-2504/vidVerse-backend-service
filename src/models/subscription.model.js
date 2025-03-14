import mongoose, {Schema} from "mongoose";

const subscriptionSchema = Schema({
    subscriber:{
        type: Schema.Types.ObjectId,
        ref:"User"
    },
    channel:{
        type:Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamps:true})

export const Subscribe = mongoose.model("Subscribe",subscriptionSchema);