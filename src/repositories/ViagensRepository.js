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

    /**
     * Colunas da listagem. A foto fica de fora de proposito: e um base64 de
     * ~400 KB por viagem, e mandar 500 delas de uma vez levaria a resposta a
     * centenas de MB. Em lugar dela vai "tem_foto", que diz se existe foto para
     * buscar, e a tela pede a imagem so da viagem que for exibir.
     */
    static get COLUNAS_LISTA() {
        return [
            "guia", "serie", "numero_documento", "fornecedor", "fornecedor_norm",
            "placa", "rmt", "tipo_conjunto", "data_inicio_viagem", "projeto",
            "talhao", "local_carregamento", "uo", "distancia", "situacao", "grua",
            "data_chegada_balanca", "pbt", "volume", "pbt_base",
            "comp1", "comp2", "comp3", "fueiro1", "fueiro2", "fueiro3",
            "observacao", "classificacao", "desvio_identificado", "tratamento",
            "criado_em", "atualizado_em",
            knex.raw("(foto is not null and foto <> '') as tem_foto"),
        ];
    }

    /** Monta os filtros uma vez so, para a contagem e a pagina usarem o mesmo recorte. */
    filtrar({ de, ate, classificacao = "com_desvio", fornecedor, projeto } = {}) {
        const q = knex("viagens");
        if (classificacao && classificacao !== "todas") q.where({ classificacao });
        if (de) q.where("data_chegada_balanca", ">=", de);
        if (ate) q.where("data_chegada_balanca", "<=", `${ate}T23:59:59`);
        if (fornecedor) q.where({ fornecedor_norm: fornecedor });
        if (projeto) q.where({ projeto });
        return q;
    }

    /** Quantas viagens o filtro alcanca, ignorando limite e offset. */
    async contar(filtros = {}) {
        const [{ total }] = await this.filtrar(filtros).count({ total: "*" });
        return Number(total || 0);
    }

    /** Uma pagina da listagem, sem a foto. Por padrao so o que tem desvio. */
    async listar({ limite, offset, ...filtros } = {}) {
        const q = this.filtrar(filtros)
            .select(ViagensRepository.COLUNAS_LISTA)
            .orderBy("data_chegada_balanca", "desc");
        if (limite) q.limit(limite);
        if (offset) q.offset(offset);
        return q;
    }

    /** Só a foto de uma viagem, buscada quando a tela precisa exibir. */
    async buscarFoto(guia) {
        return knex("viagens").where({ guia }).first("guia", "foto");
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

        // serie diaria: denominador (viagens do dia) e numerador (alertas do dia),
        // que e o que permite acompanhar a taxa de alertas por mil viagens no tempo
        const porDia = await periodo(knex("viagens"))
            .select(knex.raw("substr(data_chegada_balanca, 1, 10) as dia"))
            .count({ viagens: "*" })
            .select(
                knex.raw("sum(case when classificacao = 'com_desvio' then 1 else 0 end) as comDesvio")
            )
            .groupBy("dia")
            .orderBy("dia");

        return { totais, porFornecedor, comDesvioPorFornecedor, porDia };
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
