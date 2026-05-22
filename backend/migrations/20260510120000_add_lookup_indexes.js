/**
 * Hot-path indexes for sessions, feed, messaging, and documents.
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    await knex.schema.alterTable('sessions', (table) => {
        table.index(['user_id', 'expires_at'], 'idx_sessions_user_expires');
    });
    await knex.schema.alterTable('posts', (table) => {
        table.index(['user_id', 'created_at'], 'idx_posts_user_created');
    });
    await knex.schema.alterTable('messages', (table) => {
        table.index(['sender_id', 'timestamp'], 'idx_messages_sender_ts');
        table.index(['receiver_id', 'timestamp'], 'idx_messages_receiver_ts');
    });
    await knex.schema.alterTable('documents', (table) => {
        table.index(['user_id', 'uploaded_at'], 'idx_documents_user_uploaded');
    });
};

exports.down = async function down(knex) {
    await knex.schema.alterTable('documents', (table) => {
        table.dropIndex(['user_id', 'uploaded_at'], 'idx_documents_user_uploaded');
    });
    await knex.schema.alterTable('messages', (table) => {
        table.dropIndex(['receiver_id', 'timestamp'], 'idx_messages_receiver_ts');
        table.dropIndex(['sender_id', 'timestamp'], 'idx_messages_sender_ts');
    });
    await knex.schema.alterTable('posts', (table) => {
        table.dropIndex(['user_id', 'created_at'], 'idx_posts_user_created');
    });
    await knex.schema.alterTable('sessions', (table) => {
        table.dropIndex(['user_id', 'expires_at'], 'idx_sessions_user_expires');
    });
};
