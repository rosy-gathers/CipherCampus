/**
 * BullMQ worker: processes OTP / transactional mail when USE_MAIL_QUEUE=true.
 * Run: npm run worker
 */
require('dotenv').config();
const logger = require('./logger');
const { startMailWorker } = require('./services/mailQueue');

startMailWorker();

process.on('SIGTERM', () => {
    logger.info('Worker SIGTERM');
    process.exit(0);
});
