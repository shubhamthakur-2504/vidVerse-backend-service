import mongoose, {Schema} from "mongoose";

const userSchema = new Schema({
    userName:{
        type:String,
        required:[true,'User name is required'],
        unique:true,
        lowercase:true,
        trim:true,
        index:true
    },
    email:{
        type:String,
        required:[true,'Email is required'],
        unique:true,
        lowercase:true,
        trim:true
    },
    fullName:{
        type:String,
        required:[true,'Full name is required'],
        trim:true
    },
    avatarUrl:{
        type:String,
        required:true
    },
    coverImageUrl:{
        type:String,
    },
    watchHistory:[
        {
            type:Schema.Types.ObjectId,
            ref:'Video'
        }
    ],
    password:{
        type:String,
        required:[true,'Password is required'],
        trim:true
    },
    refreshToken:{
        type:String
    },
},{timestamps:true})

export const User = mongoose.model('User',userSchema)