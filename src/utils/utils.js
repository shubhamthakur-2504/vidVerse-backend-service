import path from 'path';
import fs from 'fs';
import Ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import ffmpegStatic from "ffmpeg-static";
Ffmpeg.setFfmpegPath(ffmpegStatic)
Ffmpeg.setFfprobePath(ffprobeStatic.path)


// usage: in aggregation pipeline for created date return days months and years
const getCreatedAtDiffField = () => ({
    $addFields: {
        createdAtDiff: {
            $let: {
                vars: {
                    dayDiff: {
                        $dateDiff: {
                            startDate: "$createdAt",
                            endDate: new Date(),
                            unit: "day"
                        }
                    },
                    monthDiff: {
                        $dateDiff: {
                            startDate: "$createdAt",
                            endDate: new Date(),
                            unit: "month"
                        }
                    },
                    yearDiff: {
                        $dateDiff: {
                            startDate: "$createdAt",
                            endDate: new Date(),
                            unit: "year"
                        }
                    }
                },
                in: {
                    days: "$$dayDiff",
                    months: "$$monthDiff",
                    years: "$$yearDiff"
                }
            }
        }
    }
});


// usage: in aggregation pipeline for created date return relative time
const formatRelativeTime = (createdAtDiff) => {
    const { days, months, years } = createdAtDiff;

    if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''} ago`;
    } else if (months > 0) {
        return `${months} month${months > 1 ? 's' : ''} ago`;
    } else if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
        return 'Today';
    }
};

const extractPublicId = (url) => {
    const parts = url.split('/');
    const publicIdWithExtension = parts.slice(-2).join('/');
    const publicId = publicIdWithExtension.split('.')[0]; // Remove the file extension
    return publicId;
}

const isEdited = (createdAt, updatedAt) => {
    const threshold = 1000; // 1 second threshold (in milliseconds)
    return Math.abs(createdAt.getTime() - updatedAt.getTime()) > threshold;
};

const canEdit = (createdAt) => {
    const now = new Date()
    return ((now - createdAt) < 15 * 60 * 1000)
}


const createVideoChunks = (inputPath) => {
    return new Promise((resolve, reject) => {
        const outputDir = path.join(process.cwd(), 'public', 'temps', `hls_${Date.now()}`);
        fs.mkdirSync(outputDir, { recursive: true });

        const manifestPath = path.join(outputDir, 'index.m3u8');

        // FFmpeg HLS command
        Ffmpeg(inputPath)
            .outputOptions([
                '-c:v', 'libx264',
                '-profile:v', 'main',
                '-level', '3.1',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', 'frag_keyframe+empty_moov',  // Helps for some streaming cases
                '-hls_time', '10',
                '-hls_playlist_type', 'vod',              // Explicitly say it's VOD
                '-hls_segment_filename', `${outputDir}/chunk_%03d.ts`, // Consistent naming
                '-start_number', '0',
                '-hls_list_size', '0',
                '-f', 'hls'
            ])

            .output(manifestPath)
            .on('end', () => {
                const chunkPaths = fs.readdirSync(outputDir)
                    .filter(f => f.endsWith('.ts'))
                    .map(f => path.join(outputDir, f));

                resolve({ manifestPath, chunkPaths, outputDir });
            })
            .on('error', (err) => {
                reject(err);
            })
            .run();
    });
};



export { getCreatedAtDiffField, formatRelativeTime, extractPublicId, isEdited, canEdit, createVideoChunks };