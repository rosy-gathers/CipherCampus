/**
 * User-defined folders for owned vault documents + optional folder_id on documents.
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    const hasFolders = await knex.schema.hasTable('document_folders');
    if (!hasFolders) {
        await knex.schema.createTable('document_folders', (table) => {
            table.increments('id').primary();
            table.integer('user_id').notNullable();
            table.string('name', 255).notNullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.foreign('user_id').references('users.id').onDelete('CASCADE');
            table.unique(['user_id', 'name'], 'uq_document_folders_user_name');
        });
    }

    const hasCol = await knex.schema.hasColumn('documents', 'folder_id');
    if (!hasCol) {
        await knex.schema.alterTable('documents', (table) => {
            table.integer('folder_id').unsigned().nullable();
            table.foreign('folder_id').references('document_folders.id').onDelete('SET NULL');
        });
    }
};

exports.down = async function down(knex) {
    const hasCol = await knex.schema.hasColumn('documents', 'folder_id');
    if (hasCol) {
        await knex.schema.alterTable('documents', (table) => {
            table.dropForeign(['folder_id']);
            table.dropColumn('folder_id');
        });
    }
    await knex.schema.dropTableIfExists('document_folders');
};
