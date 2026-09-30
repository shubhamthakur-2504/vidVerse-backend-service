import mongoose, {Schema} from "mongoose";
import bcrypt from "bcrypt";

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
    // set when the owner opens the emailed verification link (or a password reset link); null until then
    emailVerifiedAt:{
        type:Date,
        default:null
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
    // legacy: refresh token from before per-device sessions, migrated on first refresh
    refreshToken:{
        type:String
    },
},{timestamps:true})

// removing a deleted video from everyone's watch history ($pull) looks users up by this array
userSchema.index({ watchHistory: 1 })

userSchema.pre('save', async function (next) {
    if(!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password,10)
    next()
})

userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password,this.password)
}
// access / refresh tokens are issued by services/session.service.js

export const User = mongoose.model('User',userSchema)