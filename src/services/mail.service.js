import nodemailer from "nodemailer";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// Outgoing email. With SMTP_URL set, mail goes through that server. Without it:
// - tests collect messages in `outbox` (read by the tests),
// - development prints each message to the log so the links can be clicked locally,
// - production sends nothing and warns, and never logs the message (it carries one-time links).
export const outbox = [];

const transport = config.mail.smtpUrl ? nodemailer.createTransport(config.mail.smtpUrl) : null;

// never throws: a mail problem is logged and reported as false, so callers decide whether it matters
export const sendMail = async ({ to, subject, text }) => {
    const message = { from: config.mail.from, to, subject, text };
    try {
        if (transport) {
            await transport.sendMail(message);
        } else if (config.env === "test") {
            outbox.push(message);
        } else if (config.isDevelopment) {
            logger.info({ to, subject, text }, "email (SMTP_URL not set, printed instead of sent)");
        } else {
            logger.warn({ subject }, "email not sent: SMTP_URL is not configured");
            return false;
        }
        return true;
    } catch (error) {
        logger.error({ err: error, subject }, "email sending failed");
        return false;
    }
};

const link = (path, token) => `${config.appUrl}${path}?token=${encodeURIComponent(token)}`;

export const sendVerificationEmail = (user, token) =>
    sendMail({
        to: user.email,
        subject: "Confirm your email for VidVerse",
        text: [
            `Hi ${user.fullName || user.userName},`,
            "",
            "Confirm your email address by opening this link:",
            link("/auth/verify-email", token),
            "",
            "The link works for 24 hours. If you didn't create a VidVerse account, you can ignore this email.",
        ].join("\n"),
    });

export const sendPasswordResetEmail = (user, token) =>
    sendMail({
        to: user.email,
        subject: "Reset your VidVerse password",
        text: [
            `Hi ${user.fullName || user.userName},`,
            "",
            "Someone asked to reset the password for your VidVerse account. To choose a new password, open this link:",
            link("/auth/reset-password", token),
            "",
            "The link works for 1 hour and only once. If you didn't ask for this, you can ignore this email; your password stays the same.",
        ].join("\n"),
    });
