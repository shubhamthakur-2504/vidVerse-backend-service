import mongoose, {Schema} from "mongoose";

const videoSchema = new Schema({
    videoFileUrl:{
        type:String,
        required:true
    },
    // direct uploads get their thumbnail from the processing job, so it is only required once the video is ready
    thumbnailUrl:{
        type:String,
        required: function () { return this.status === "ready" }
    },
    title:{
        type:String,
        required:true
    },
    description:{
        type:String,
    },
    views:{
        type:Number,
        default:0
    },
    // seconds; set from Cloudinary's metadata on direct upload and from ffprobe by the processing job
    duration:{
        type:Number,
        default:0
    },
    isPublished:{
        type:Boolean,
        default:true
    },
    status:{
        type:String,
        enum:["processing","ready","failed"],
        default:"processing"
    },
    category:{
        type:String,
        enum:["General","Gaming","Music","Sports","News","Science","Education","Entertainment","Comedy","Travel","Food","Technology","Fitness","Fashion","Film","Anime","Podcasts","Vlogs"],
        default:"General"
    },
    owner:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    // Cloudinary public id of a direct upload (uploads/<userId>/<uuid>); prevents registering one upload twice
    sourcePublicId:{
        type:String
    }
},{timestamps:true})

videoSchema.index({ sourcePublicId: 1 }, { unique: true, sparse: true })


// public feed (newest first, optionally per category) and "my videos"; createdAt + _id is the pagination cursor
videoSchema.index({ status: 1, isPublished: 1, createdAt: -1, _id: -1 })
videoSchema.index({ category: 1, status: 1, isPublished: 1, createdAt: -1, _id: -1 })
// search sorted by views (cursor: views + _id)
videoSchema.index({ status: 1, isPublished: 1, views: -1, _id: -1 })
videoSchema.index({ owner: 1, createdAt: -1 })
// a channel's public videos and the subscriptions feed (owner $in [...]: one merged index scan per channel)
videoSchema.index({ owner: 1, status: 1, isPublished: 1, createdAt: -1, _id: -1 })

export const Video = mongoose.model("Video",videoSchema)