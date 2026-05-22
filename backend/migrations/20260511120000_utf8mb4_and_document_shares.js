/**
 * utf8mb4 for emoji/Unicode; document_shares for ACL file sharing.
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    const dbName = knex.client.config.connection.database || process.env.DB_NAME || 'ciphercampus';
    try {
        await knex.raw(`ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (e) {
        /* ignore if insufficient privilege */
    }

    const convertTables = [
        'users',
        'posts',
        'messages',
        'documents',
        'document_shares',
        'reports',
        'key_rotation_log',
        'sessions',
        'knex_migrations',
        'knex_migrations_lock',
    ];
    for (const t of convertTables) {
        try {
            const has = await knex.schema.hasTable(t);
            if (has) {
                await knex.raw(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            }
        } catch (e) {
            /* table missing or already utf8mb4 */
        }
    }

    const hasShares = await knex.schema.hasTable('document_shares');
    if (!hasShares) {
        await knex.schema.createTable('document_shares', (table) => {
            table.increments('id').primary();
            // Match legacy `INT` PKs on `documents` / `users` (signed), not UNSIGNED.
            table.integer('document_id').notNullable();
            table.integer('owner_id').notNullable();
            table.integer('shared_with_user_id').notNullable();
            table.string('encrypted_file_path', 500).notNullable();
            table.string('file_hmac', 255).notNullable();
            table.string('original_file_name', 255).notNullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.unique(['document_id', 'shared_with_user_id'], 'uq_document_recipient');
            table.foreign('document_id').references('documents.id').onDelete('CASCADE');
            table.foreign('owner_id').references('users.id').onDelete('CASCADE');
            table.foreign('shared_with_user_id').references('users.id').onDelete('CASCADE');
        });
    }
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('document_shares');
};
