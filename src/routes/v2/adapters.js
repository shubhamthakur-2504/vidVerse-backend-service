// small shims that let v2's resource-style urls reuse the existing controllers

// url segment -> model name used by the Like documents
export const REACTION_TARGETS = { video: "Video", post: "Tweet", comment: "Comment" };

export const reactionFromParams = (req, res, next) => {
    const targetType = REACTION_TARGETS[req.params.targetType];
    req.body = { ...req.body, targetType, ...(req.body?.value && { isLike: req.body.value === "like" }) };
    req.query = { ...req.query, targetType };
    next();
};

// POST /playlists { videoId } -> createPlayList reads the first video from req.params.id
export const playlistVideoFromBody = (req, res, next) => {
    req.params.id = req.body.videoId;
    next();
};

// PUT|DELETE /playlists/:id/videos/:videoId -> add/removeVideoToPlayList read both ids from the body
export const playlistVideoFromParams = (req, res, next) => {
    req.body = { playListId: req.params.id, videoId: req.params.videoId };
    next();
};
