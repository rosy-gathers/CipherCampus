const nodemailer = require('nodemailer');

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
}

/**
 * Send OTP email inline or via BullMQ (when USE_MAIL_QUEUE=true and REDIS_URL set).
 * When using the queue, run `npm run worker` so jobs are processed.
 */
async function dispatchOtpEmail({ to, subject, text }) {
    const from = process.env.EMAIL_USER?.trim();
    if (!from) {
        throw new Error('EMAIL_USER is not configured; set SMTP credentials for OTP delivery.');
    }
    const payload = { from, to, subject, text };

    if (process.env.USE_MAIL_QUEUE === 'true' && process.env.REDIS_URL) {
        const { enqueueOtpMailAndWait } = require('./mailQueue');
        await enqueueOtpMailAndWait(payload);
        return;
    }

    await getTransporter().sendMail(payload);
}

module.exports = { dispatchOtpEmail, getTransporter };
