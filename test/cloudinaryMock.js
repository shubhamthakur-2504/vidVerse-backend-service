import fs from "fs/promises";
import path from "path";
import { vi } from "vitest";

// stand-in for src/utils/cloudinary.js: removes the local temp file like the real uploader and records calls
let counter = 0;
export const cloudinaryMock = {
    uploadOnCloudinary: vi.fn(async (localPath, fileType) => {
        counter += 1;
        await fs.unlink(localPath).catch(() => {});
        return {
            url: `https://res.cloudinary.com/test/image/upload/v1/${fileType}s/up${counter}.png`,
            public_id: `${fileType}s/up${counter}`,
        };
    }),
    deleteFromCloudinary: vi.fn(async () => ({ result: "ok" })),
    deleteCloudinaryFolder: vi.fn(async () => {}),
    downloadFromCloudinary: vi.fn(async () => {}),
    getVideoResource: vi.fn(async () => null),
    uploadFileForHls: vi.fn(
        async (filePath, { folder }) =>
            `https://res.cloudinary.com/test/raw/upload/v1/${folder}/${path.basename(filePath)}`
    ),
};
