const knex = require("../database/knex");

/** Log de tudo que entra na API - serve de auditoria e de diagnostico de envio perdido. */
class RecebimentosRepository {
    async registrar(dados) {
        await knex("recebimentos").insert(dados);
    }

    async ultimos(limite = 20) {
        return knex("recebimentos").orderBy("id", "desc").limit(limite);
    }
}

module.exports = RecebimentosRepository;
