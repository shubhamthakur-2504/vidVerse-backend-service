import mongoose, {Schema} from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

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
userSchema.methods.generateAccessToken = function(){
    return jwt.sign({
        id:this._id,
        user:this.userName
    },config.jwt.accessSecret,{expiresIn:config.jwt.accessExpiry})
}
userSchema.methods.generateRefreshToken= async function(){
    
    const token = jwt.sign({
        id:this._id,
        user:this.userName
    },config.jwt.refreshSecret,{expiresIn:config.jwt.refreshExpiry})

    this.refreshToken = token
    await this.save()
    return token
}

export const User = mongoose.model('User',userSchema)