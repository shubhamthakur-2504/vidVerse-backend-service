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

export const Subscribe = mongoose.model("Subscribe",subscriptionSchema);