require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const connection = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'ciphercampus',
};

const shared = {
    client: 'mysql2',
    migrations: {
        directory: './migrations',
        tableName: 'knex_migrations',
    },
    connection,
    pool: { min: 0, max: 10 },
};

module.exports = {
    development: { ...shared },
    production: { ...shared },
    test: { ...shared },
};
