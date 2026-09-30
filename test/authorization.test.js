import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Tweet } = await import("../src/models/tweet.model.js");
const { Comment } = await import("../src/models/comment.model.js");
const { PlayList } = await import("../src/models/playList.model.js");
const { Video } = await import("../src/models/video.model.js");

// every mutating route must reject a logged-in user who does not own the resource
describe("ownership checks", () => {
    let owner, stranger, video, tweet, comment, playlist;

    beforeEach(async () => {
        owner = await createUser();
        stranger = await createUser();
        video = await createVideo(owner);
        tweet = await Tweet.create({ content: "hello", owner: owner._id });
        comment = await Comment.create({ content: "nice", videoId: video._id, userId: owner._id });
        playlist = await PlayList.create({
            title: "mine",
            thumbnailUrl: video.thumbnailUrl,
            videos: [video._id],
            ownerId: owner._id,
        });
    });

    const cases = () => [
        ["edit a tweet (C2)", "patch", `/api/v1/tweets/updatetweet/${tweet._id}`, { content: "hacked" }],
        ["delete a tweet", "delete", `/api/v1/tweets/delete/${tweet._id}`],
        ["edit a comment", "patch", `/api/v1/videos/editcomment/${comment._id}`, { content: "hacked" }],
        ["delete a comment", "delete", `/api/v1/videos/deletecomment/${comment._id}`],
        ["delete a comment as the video owner", "delete", `/api/v1/videos/creatercommentdelete/${comment._id}`],
        ["update a video", "patch", `/api/v1/videos/update/${video._id}`, { title: "hacked" }],
        ["toggle a video's visibility", "patch", `/api/v1/videos/toggle/${video._id}`],
        ["delete a video", "delete", `/api/v1/videos/delete/${video._id}`],
        [
            "update a playlist",
            "patch",
            `/api/v1/videos/userplaylist/updateplaylist/${playlist._id}`,
            { title: "hacked" },
        ],
        ["delete a playlist", "delete", `/api/v1/videos/userplaylist/deleteplaylist/${playlist._id}`],
        [
            "add a video to a playlist",
            "post",
            "/api/v1/videos/userplaylist/addvideotoplaylist",
            { playListId: String(playlist._id), videoId: String(video._id) },
        ],
    ];

    it("returns 403 for every mutation by a non-owner", async () => {
        for (const [label, method, url, body] of cases()) {
            // the dynamic method call gets its own line: prettier would otherwise start a line with [method]
            const call = request(app)[method](url);
            const res = await call.set(authHeader(stranger)).send(body ?? {});
            expect(res.status, label).toBe(403);
        }
        // nothing changed
        expect((await Tweet.findById(tweet._id)).content).toBe("hello");
        expect((await Comment.findById(comment._id)).content).toBe("nice");
        expect((await Video.findById(video._id)).title).toBe(video.title);
        expect((await Video.findById(video._id)).isPublished).toBe(true);
        expect((await PlayList.findById(playlist._id)).title).toBe("mine");
    });

    it("returns 401 for every mutation without a token", async () => {
        for (const [label, method, url, body] of cases()) {
            const call = request(app)[method](url);
            const res = await call.send(body ?? {});
            expect(res.status, label).toBe(401);
        }
    });

    it("lets the owner edit their tweet and the video owner remove comments on their video", async () => {
        const edit = await request(app)
            .patch(`/api/v1/tweets/updatetweet/${tweet._id}`)
            .set(authHeader(owner))
            .send({ content: "edited" });
        expect(edit.status).toBe(200);

        const strangerComment = await Comment.create({ content: "spam", videoId: video._id, userId: stranger._id });
        const removed = await request(app)
            .delete(`/api/v1/videos/creatercommentdelete/${strangerComment._id}`)
            .set(authHeader(owner));
        expect(removed.status).toBe(200);
        expect(await Comment.findById(strangerComment._id)).toBeNull();
    });
});
