const db = require('./config/database');

async function test() {
    try {
        const [rows] = await db.query('SELECT 1');
        console.log("Query success:", rows);
    } catch (e) {
        console.error("Query failed:", e.message);
    } finally {
        process.exit(0);
    }
}
test();
