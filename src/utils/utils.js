
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
    return ((now-createdAt) < 15*60*1000)
}

export { getCreatedAtDiffField, formatRelativeTime, extractPublicId, isEdited, canEdit };