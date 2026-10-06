/**
 * Conformidade do limite do fueiro por compartimento. E item de seguranca:
 * ausencia de resposta vale como NAO conforme, por isso o padrao e false e
 * nao nulo - o analista precisa marcar ativamente.
 */
exports.up = (knex) =>
    knex.schema.alterTable("viagens", (t) => {
        t.boolean("fueiro1").notNullable().defaultTo(false);
        t.boolean("fueiro2").notNullable().defaultTo(false);
        t.boolean("fueiro3").notNullable().defaultTo(false);
    });

exports.down = (knex) =>
    knex.schema.alterTable("viagens", (t) => {
        t.dropColumn("fueiro1");
        t.dropColumn("fueiro2");
        t.dropColumn("fueiro3");
    });
