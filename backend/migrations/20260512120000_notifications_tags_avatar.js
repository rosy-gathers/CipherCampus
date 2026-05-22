/**
 * In-app notifications, post tags, profile avatars (encrypted at rest).
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    const hasTags = await knex.schema.hasColumn('posts', 'tags_json');
    if (!hasTags) {
        await knex.schema.alterTable('posts', (table) => {
            table.text('tags_json').nullable();
        });
    }

    const hasAvatarPath = await knex.schema.hasColumn('users', 'avatar_cipher_path');
    if (!hasAvatarPath) {
        await knex.schema.alterTable('users', (table) => {
            table.string('avatar_cipher_path', 500).nullable();
            table.string('avatar_hmac', 255).nullable();
            table.string('avatar_mime', 64).nullable();
        });
    }

    const hasNotif = await knex.schema.hasTable('notifications');
    if (!hasNotif) {
        await knex.schema.createTable('notifications', (table) => {
            table.increments('id').primary();
            table.integer('user_id').notNullable();
            table.string('type', 32).notNullable();
            table.string('title', 255).notNullable();
            table.text('body').nullable();
            table.text('payload').nullable();
            table.timestamp('read_at').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.foreign('user_id').references('users.id').onDelete('CASCADE');
            table.index(['user_id']);
        });
    }
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('notifications');
    const hasAvatarPath = await knex.schema.hasColumn('users', 'avatar_cipher_path');
    if (hasAvatarPath) {
        await knex.schema.alterTable('users', (table) => {
            table.dropColumn('avatar_cipher_path');
            table.dropColumn('avatar_hmac');
            table.dropColumn('avatar_mime');
        });
    }
    const hasTags = await knex.schema.hasColumn('posts', 'tags_json');
    if (hasTags) {
        await knex.schema.alterTable('posts', (table) => {
            table.dropColumn('tags_json');
        });
    }
};
