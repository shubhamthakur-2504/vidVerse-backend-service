import JWT from "jsonwebtoken";
import { User } from "../src/models/user.model.js";
import { Video } from "../src/models/video.model.js";

let counter = 0;

export const createUser = async (overrides = {}) => {
    counter += 1;
    return User.create({
        userName: `user${counter}`,
        email: `user${counter}@example.com`,
        fullName: `User ${counter}`,
        avatarUrl: `https://res.cloudinary.com/test/image/upload/v1/avatars/a${counter}.png`,
        password: "password123",
        ...overrides,
    });
};

// Authorization header for a user, the same way the API issues access tokens
export const authHeader = (user) => ({
    Authorization: `Bearer ${JWT.sign({ id: user._id, user: user.userName }, process.env.JWT_ACCESS_SECRET, { expiresIn: "15m" })}`,
});

export const createVideo = async (owner, overrides = {}) => {
    counter += 1;
    return Video.create({
        videoFileUrl: `https://res.cloudinary.com/test/raw/upload/v1/videos/v${counter}/index.m3u8`,
        thumbnailUrl: `https://res.cloudinary.com/test/image/upload/v1/thumbnails/t${counter}.jpg`,
        title: `Video ${counter}`,
        duration: 42,
        status: "ready",
        owner: owner._id,
        ...overrides,
    });
};
