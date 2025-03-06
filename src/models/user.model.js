import mongoose, {Schema} from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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
    },process.env.JWT_ACCESS_SECRET,{expiresIn:process.env.JWT_ACCESS_TOKEN_EXPIRY})
}
userSchema.methods.generateRefreshToken= async function(){
    
    const token = jwt.sign({
        id:this._id,
        user:this.userName
    },process.env.JWT_REFRESH_SECRET,{expiresIn:process.env.JWT_REFRESH_TOKEN_EXPIRY})

    this.refreshToken = token
    await this.save()
    return token
}

export const User = mongoose.model('User',userSchema)