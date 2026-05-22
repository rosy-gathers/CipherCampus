const { Queue, QueueEvents, Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../logger');

const QUEUE_NAME = 'ciphercampus-mail';

const redisOpts = { maxRetriesPerRequest: null };

let sharedParent = null;
function getSharedParent() {
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (!sharedParent) {
        sharedParent = new IORedis(url, redisOpts);
    }
    return sharedParent;
}

let queueSingleton = null;
let eventsSingleton = null;

function getQueue() {
    const parent = getSharedParent();
    if (!parent) return null;
    if (!queueSingleton) {
        queueSingleton = new Queue(QUEUE_NAME, { connection: parent.duplicate() });
    }
    return queueSingleton;
}

function getQueueEvents() {
    const parent = getSharedParent();
    if (!parent) return null;
    if (!eventsSingleton) {
        eventsSingleton = new QueueEvents(QUEUE_NAME, { connection: parent.duplicate() });
    }
    return eventsSingleton;
}

const MAIL_TIMEOUT_MS = Number(process.env.MAIL_JOB_TIMEOUT_MS) || 25000;

async function enqueueOtpMailAndWait(mailOptions) {
    const queue = getQueue();
    const queueEvents = getQueueEvents();
    if (!queue || !queueEvents) {
        throw new Error('Redis is required for mail queue');
    }
    await queueEvents.waitUntilReady();
    const job = await queue.add('otp', mailOptions, { removeOnComplete: 100, removeOnFail: 50 });
    await job.waitUntilFinished(queueEvents, MAIL_TIMEOUT_MS);
}

/**
 * Start worker (separate process). Uses same transporter config as API.
 */
function startMailWorker() {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.error('REDIS_URL missing; worker cannot start');
        process.exit(1);
    }
    const conn = new IORedis(url, redisOpts);
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            if (job.name === 'otp') {
                await transporter.sendMail(job.data);
            }
        },
        { connection: conn }
    );

    worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Mail job completed'));
    worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Mail job failed'));

    logger.info('Mail worker listening for jobs');
    return worker;
}

module.exports = { enqueueOtpMailAndWait, startMailWorker, getQueue, QUEUE_NAME };
