const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'ciphercampus',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// Test connection immediately
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

module.exports = promisePool;