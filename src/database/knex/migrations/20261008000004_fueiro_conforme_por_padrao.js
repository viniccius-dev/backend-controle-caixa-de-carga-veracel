/**
 * Inverte o padrao do limite do fueiro: agora a viagem nasce CONFORME nos tres
 * compartimentos e o analista marca apenas as excecoes.
 *
 * A migracao 20261006000003 fez o contrario de proposito - item de seguranca,
 * ausencia de resposta valendo como nao conforme. A gestao pediu a inversao
 * porque a grande maioria chega conforme e marcar tres botoes por viagem estava
 * custando tempo da fila. A contrapartida e conhecida: "conforme" passa a ser o
 * que acontece quando ninguem olha.
 *
 * Viagem que o analista JA tratou nao e tocada - o que ele respondeu continua
 * valendo. So as pendentes recebem o novo padrao.
 */
exports.up = async (knex) => {
    await knex.schema.alterTable("viagens", (t) => {
        t.boolean("fueiro1").notNullable().defaultTo(true).alter();
        t.boolean("fueiro2").notNullable().defaultTo(true).alter();
        t.boolean("fueiro3").notNullable().defaultTo(true).alter();
    });

    await knex("viagens")
        .where({ tratamento: "pendente" })
        .whereNull("desvio_identificado")
        .update({ fueiro1: true, fueiro2: true, fueiro3: true });
};

exports.down = async (knex) => {
    await knex.schema.alterTable("viagens", (t) => {
        t.boolean("fueiro1").notNullable().defaultTo(false).alter();
        t.boolean("fueiro2").notNullable().defaultTo(false).alter();
        t.boolean("fueiro3").notNullable().defaultTo(false).alter();
    });

    await knex("viagens")
        .where({ tratamento: "pendente" })
        .whereNull("desvio_identificado")
        .update({ fueiro1: false, fueiro2: false, fueiro3: false });
};
