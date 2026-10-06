exports.up = (knex) =>
    knex.schema.createTable("recebimentos", (t) => {
        t.increments("id").primary();
        t.string("recebido_em").notNullable();
        t.string("origem");
        t.string("transporte");     // http | email
        t.string("referencia");     // message-id do e-mail, quando houver
        t.integer("recebidas").notNullable().defaultTo(0);
        t.integer("criadas").notNullable().defaultTo(0);
        t.integer("atualizadas").notNullable().defaultTo(0);
        t.integer("sem_mudanca").notNullable().defaultTo(0);
        t.integer("rejeitadas").notNullable().defaultTo(0);
        t.text("detalhe");
    });

exports.down = (knex) => knex.schema.dropTableIfExists("recebimentos");
