const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDb() {
    let connection;
    let exitCode = 0;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD ?? '',
            port: Number(process.env.DB_PORT) || 3306,
            multipleStatements: true
        });

        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        await connection.query(schema);
        console.log('Database schema applied successfully.');
        console.log('Next: from backend/, run npm run migrate for indexes (optional but recommended).');
    } catch (err) {
        console.error('Error applying schema:', err);
        exitCode = 1;
    } finally {
        if (connection) {
            await connection.end();
        }
        process.exit(exitCode);
    }
}

initDb();
