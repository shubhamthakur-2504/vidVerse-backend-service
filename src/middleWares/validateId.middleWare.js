import { apiError } from "../utils/apiError.js";

// exactly what ObjectId.createFromHexString accepts
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// register with router.param("id", validateObjectIdParam): runs before any handler on routes with that param,
// so controllers never hit the database (or throw) with a malformed id
export const validateObjectIdParam = (req, res, next, value, name) => {
    if (!OBJECT_ID_PATTERN.test(value)) {
        return next(new apiError(400, `Invalid ${name}`));
    }
    next();
};
