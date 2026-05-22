const logger = require('../logger');

const TTL_SECONDS = 10 * 60;
const PREFIX = 'ciphercampus:otp:';
const memoryStore = new Map();

let redis = null;
let redisConnectAttempted = false;

async function getRedis() {
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (redis) return redis;
    if (redisConnectAttempted) return null;
    redisConnectAttempted = true;
    try {
        const { createClient } = require('redis');
        const client = createClient({ url });
        client.on('error', (err) => logger.error({ err }, 'Redis client error'));
        await client.connect();
        redis = client;
        logger.info('OTP store: using Redis');
    } catch (err) {
        logger.warn({ err: err.message }, 'OTP store: Redis unavailable, using in-memory Map');
        redis = null;
    }
    return redis;
}

async function setChallenge(userId, payload) {
    const id = String(userId);
    const r = await getRedis();
    if (r) {
        await r.setEx(PREFIX + id, TTL_SECONDS, JSON.stringify(payload));
        return;
    }
    memoryStore.set(id, payload);
}

async function getChallenge(userId) {
    const id = String(userId);
    const r = await getRedis();
    if (r) {
        const raw = await r.get(PREFIX + id);
        return raw ? JSON.parse(raw) : null;
    }
    return memoryStore.get(id) || null;
}

async function deleteChallenge(userId) {
    const id = String(userId);
    const r = await getRedis();
    if (r) {
        await r.del(PREFIX + id);
        return;
    }
    memoryStore.delete(id);
}

module.exports = { setChallenge, getChallenge, deleteChallenge };
