const express = require('express');
const db = require('../config/database');
const logger = require('../logger');

const router = express.Router();

/** Liveness: process is up (orchestrators use this). */
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'ciphercampus-backend',
        liveness: true,
    });
});

/** Readiness: dependencies required for serving traffic. */
router.get('/ready', async (req, res) => {
    const checks = { mysql: false, redis: false };

    try {
        await db.query('SELECT 1');
        checks.mysql = true;
    } catch (e) {
        logger.warn({ err: e.message }, 'Readiness: MySQL failed');
    }

    if (process.env.REDIS_URL) {
        try {
            const { createClient } = require('redis');
            const client = createClient({ url: process.env.REDIS_URL });
            await client.connect();
            await client.ping();
            await client.quit();
            checks.redis = true;
        } catch (e) {
            logger.warn({ err: e.message }, 'Readiness: Redis failed');
        }
    } else {
        checks.redis = true;
        checks.redisNote = 'optional_not_configured';
    }

    const ok = checks.mysql && checks.redis;
    const status = ok ? 200 : 503;
    res.status(status).json({
        ok,
        checks,
        service: 'ciphercampus-backend',
        readiness: ok,
    });
});

module.exports = router;
