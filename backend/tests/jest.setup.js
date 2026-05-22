const db = require('../config/database');

afterAll(async () => {
    await db.end();
});
