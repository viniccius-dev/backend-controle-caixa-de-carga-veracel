const knex = require("../database/knex");

/** Acesso a tabela de viagens. Sem regra de negocio: so leitura e escrita. */
class ViagensRepository {
    async buscarPorGuia(guia, trx = knex) {
        return trx("viagens").where({ guia }).first();
    }

    async inserir(linha, trx = knex) {
        await trx("viagens").insert(linha);
    }

    async atualizar(guia, mudancas, trx = knex) {
        await trx("viagens").where({ guia }).update(mudancas);
    }

    /** Lista com filtros opcionais. Por padrao devolve so o que tem desvio:
     *  e o universo com que o analista e o painel trabalham. */
    async listar({ de, ate, classificacao = "com_desvio", fornecedor, projeto, limite, offset } = {}) {
        const q = knex("viagens");
        if (classificacao && classificacao !== "todas") q.where({ classificacao });
        if (de) q.where("data_chegada_balanca", ">=", de);
        if (ate) q.where("data_chegada_balanca", "<=", `${ate}T23:59:59`);
        if (fornecedor) q.where({ fornecedor_norm: fornecedor });
        if (projeto) q.where({ projeto });
        q.orderBy("data_chegada_balanca", "desc");
        if (limite) q.limit(limite);
        if (offset) q.offset(offset);
        return q;
    }

    async excluir(guias) {
        if (!guias?.length) return 0;
        return knex("viagens").whereIn("guia", guias).del();
    }

    /** Totais do periodo, incluindo as viagens SEM desvio - e o denominador que
     *  faltava para responder "397 de 5.101 viagens". */
    async estatisticas({ de, ate } = {}) {
        const periodo = (q) => {
            if (de) q.where("data_chegada_balanca", ">=", de);
            if (ate) q.where("data_chegada_balanca", "<=", `${ate}T23:59:59`);
            q.whereNotNull("data_chegada_balanca");
            return q;
        };

        const totais = await periodo(knex("viagens"))
            .select("classificacao")
            .count({ viagens: "*" })
            .sum({ volume: "volume" })
            .groupBy("classificacao");

        const porFornecedor = await periodo(knex("viagens"))
            .select("fornecedor_norm")
            .count({ viagens: "*" })
            .sum({ volume: "volume" })
            .groupBy("fornecedor_norm");

        const comDesvioPorFornecedor = await periodo(knex("viagens"))
            .where({ classificacao: "com_desvio" })
            .select("fornecedor_norm")
            .count({ comDesvio: "*" })
            .groupBy("fornecedor_norm");

        return { totais, porFornecedor, comDesvioPorFornecedor };
    }

    async listarFila() {
        return knex("viagens")
            .where({ classificacao: "com_desvio" })
            .whereNull("desvio_identificado")
            .orderBy("data_chegada_balanca", "desc");
    }

    async contarPorClassificacao() {
        return knex("viagens").select("classificacao").count({ total: "*" }).groupBy("classificacao");
    }

    transacao(fn) {
        return knex.transaction(fn);
    }
}

module.exports = ViagensRepository;
