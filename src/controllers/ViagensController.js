const AppError = require("../utils/AppError");
const ViagensRepository = require("../repositories/ViagensRepository");
const RecebimentosRepository = require("../repositories/RecebimentosRepository");
const ViagensService = require("../services/ViagensService");
const { paraFront, paraBanco } = require("../utils/viagemDTO");

const LIMITE_PADRAO = 500;
const LIMITE_MAXIMO = 5000;

class ViagensController {
    /** Recebe o lote da planilha (via e-mail ou POST direto). */
    async create(request, response) {
        const { viagens, origem, transporte, referencia } = request.body || {};
        const service = new ViagensService(new ViagensRepository(), new RecebimentosRepository());
        const resumo = await service.gravarLote(viagens, { origem, transporte, referencia });
        return response.json({ ok: true, ...resumo });
    }

    /**
     * Lista para a plataforma. Devolve so viagens com desvio, salvo pedido explicito.
     *
     * A resposta continua sendo um array puro, para nao quebrar quem ja consome.
     * O total do filtro vai no cabecalho X-Total-Count: com ele a tela sabe se
     * ainda falta pagina para buscar, em vez de receber um recorte silencioso.
     */
    async index(request, response) {
        const { de, ate, classificacao, fornecedor, projeto, limite, offset } = request.query;
        const repository = new ViagensRepository();
        const filtros = { de, ate, classificacao, fornecedor, projeto };

        const paginacao = {
            limite: Math.min(Number(limite) || LIMITE_PADRAO, LIMITE_MAXIMO),
            offset: Math.max(Number(offset) || 0, 0),
        };

        const [total, linhas] = await Promise.all([
            repository.contar(filtros),
            repository.listar({ ...filtros, ...paginacao }),
        ]);

        response.set("X-Total-Count", String(total));
        response.set("X-Limite", String(paginacao.limite));
        response.set("X-Offset", String(paginacao.offset));
        response.set("Access-Control-Expose-Headers", "X-Total-Count, X-Limite, X-Offset");
        return response.json(linhas.map(paraFront));
    }

    /** Foto de uma viagem, buscada so quando a tela vai exibir. */
    async foto(request, response) {
        const linha = await new ViagensRepository().buscarFoto(request.params.guia);
        if (!linha) throw new AppError(`viagem ${request.params.guia} nao encontrada`, 404);
        return response.json({ alertaId: linha.guia, foto: linha.foto || null });
    }

    /** Grava o que o analista preencheu. Dado do SGF nao entra por aqui. */
    async update(request, response) {
        const { guia } = request.params;
        const repository = new ViagensRepository();

        const atual = await repository.buscarPorGuia(guia);
        if (!atual) throw new AppError(`viagem ${guia} nao encontrada`, 404);

        const mudancas = paraBanco(request.body);
        if (Object.keys(mudancas).length === 0) {
            throw new AppError("nenhum campo valido para atualizar", 400);
        }

        mudancas.atualizado_em = new Date().toISOString().slice(0, 19);
        await repository.atualizar(guia, mudancas);
        return response.json(paraFront(await repository.buscarPorGuia(guia)));
    }

    async destroy(request, response) {
        const guias = String(request.query.guias || "").split(",").map((g) => g.trim()).filter(Boolean);
        if (!guias.length) throw new AppError("informe as guias a excluir", 400);
        const excluidas = await new ViagensRepository().excluir(guias);
        return response.json({ ok: true, excluidas });
    }

    /**
     * Totais do periodo, com as viagens sem desvio incluidas. E o que permite ao
     * painel mostrar "397 de 5.101 viagens" e a taxa de desvio por transportadora,
     * numeros que ate agora eram montados a mao em apresentacao.
     */
    async estatisticas(request, response) {
        const { de, ate } = request.query;
        const { totais, porFornecedor, comDesvioPorFornecedor, porDia } = await new ViagensRepository()
            .estatisticas({ de, ate });

        const numero = (x) => Number(x || 0);
        const porClasse = Object.fromEntries(
            totais.map((t) => [t.classificacao, { viagens: numero(t.viagens), volume: numero(t.volume) }])
        );
        const soma = (campo) => totais.reduce((a, t) => a + numero(t[campo]), 0);
        const desviosPorFornecedor = Object.fromEntries(
            comDesvioPorFornecedor.map((f) => [f.fornecedor_norm, numero(f.comDesvio)])
        );

        return response.json({
            periodo: { de: de || null, ate: ate || null },
            // viagens e alertas dia a dia: base da taxa de alertas por mil viagens
            porDia: porDia.map((d) => ({
                dia: d.dia,
                viagens: numero(d.viagens),
                comDesvio: numero(d.comDesvio),
            })),
            totalViagens: soma("viagens"),
            volumeTotal: soma("volume"),
            porClassificacao: porClasse,
            comDesvio: porClasse.com_desvio?.viagens || 0,
            fornecedores: porFornecedor
                .map((f) => ({
                    fornecedor: f.fornecedor_norm || "NAO INFORMADO",
                    viagens: numero(f.viagens),
                    volume: numero(f.volume),
                    comDesvio: desviosPorFornecedor[f.fornecedor_norm] || 0,
                }))
                .sort((a, b) => b.viagens - a.viagens),
        });
    }

    async fila(_request, response) {
        const linhas = await new ViagensRepository().listarFila();
        return response.json(linhas.map(paraFront));
    }

    async resumo(_request, response) {
        const porClassificacao = await new ViagensRepository().contarPorClassificacao();
        const ultimos = await new RecebimentosRepository().ultimos(10);
        return response.json({ porClassificacao, ultimosRecebimentos: ultimos });
    }
}

module.exports = ViagensController;
