import fs from "fs";
import { apiError } from "../utils/apiError.js";

// multer has already written these by the time validation runs on multipart routes
const removeUploadedFiles = (req) => {
    const files = [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files ?? {}).flat())].filter(Boolean);
    for (const file of files) fs.unlink(file.path, () => {});
};

/**
 * validate({ body, query }) with zod schemas.
 * On success req.body / req.query are replaced by the parsed values (trimmed, coerced, unknown keys stripped).
 * On failure responds 400 "Validation failed" with one { field, message } entry per problem.
 */
export const validate = (schemas) => (req, res, next) => {
    const errors = [];
    for (const part of ["body", "query"]) {
        if (!schemas[part]) continue;
        const result = schemas[part].safeParse(req[part] ?? {});
        if (result.success) {
            req[part] = result.data;
        } else {
            errors.push(...result.error.issues.map((issue) => ({ field: issue.path.join(".") || part, message: issue.message })));
        }
    }
    if (errors.length) {
        removeUploadedFiles(req);
        return next(new apiError(400, "Validation failed", errors));
    }
    next();
};
