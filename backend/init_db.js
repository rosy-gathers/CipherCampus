const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function initDb() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: '127.0.0.1',
            user: 'root',
            password: '',
            port: 3306,
            multipleStatements: true
        });

        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        await connection.query(schema);
        console.log('Database schema applied successfully.');
    } catch (err) {
        console.error('Error applying schema:', err);
    } finally {
        if (connection) {
            await connection.end();
        }
        process.exit();
    }
}

initDb();
