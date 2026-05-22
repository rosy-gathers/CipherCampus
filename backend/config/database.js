const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'ciphercampus',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: process.env.NODE_ENV === 'test' ? 3000 : 10000,
});

const promisePool = pool.promise();

// Test connection on startup (skip in automated tests to avoid long timeouts when DB is down)
if (process.env.NODE_ENV !== 'test') {
    (async () => {
        try {
            const connection = await promisePool.getConnection();
            console.log('✅ MySQL database connected successfully on port 3306');
            connection.release();
        } catch (err) {
            console.error('❌ MySQL connection failed:', err.message);
            console.error('Please check:');
            console.error('1. MySQL is running in XAMPP');
            console.error('2. Database "ciphercampus" exists');
            console.error('3. Port 3306 is correct');
        }
    })();
}

module.exports = promisePool;