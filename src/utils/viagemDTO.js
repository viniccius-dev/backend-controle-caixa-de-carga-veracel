/**
 * Traducao entre o banco (snake_case, "guia") e o front (camelCase, "alertaId").
 *
 * As duas pontas nasceram separadas: o front veio do MVP que lia alerta de texto,
 * o banco veio do contrato do SGF. Em vez de renomear um dos lados e quebrar o que
 * ja funciona, a conversao fica isolada aqui.
 */

const PBT_BASE_PADRAO = 74000;

/** Linha do banco -> objeto que o front consome. */
function paraFront(linha) {
    if (!linha) return null;
    return {
        alertaId: linha.guia,
        fornecedor: linha.fornecedor || "",
        dataChegadaBalanca: linha.data_chegada_balanca || linha.data_inicio_viagem || "",
        pbtReal: linha.pbt ?? 0,
        pbtBase: linha.pbt_base ?? PBT_BASE_PADRAO,
        volumeCarga: linha.volume ?? 0,
        projeto: linha.projeto || "",
        talhao: linha.talhao || undefined,
        equipamento: linha.placa || undefined,
        rmt: linha.rmt || undefined,
        grua: linha.grua || undefined,
        distancia: linha.distancia ?? undefined,
        tipoConjunto: linha.tipo_conjunto || undefined,

        comp1: linha.comp1 ?? undefined,
        comp2: linha.comp2 ?? undefined,
        comp3: linha.comp3 ?? undefined,
        fueiro1: !!linha.fueiro1,
        fueiro2: !!linha.fueiro2,
        fueiro3: !!linha.fueiro3,
        foto: linha.foto || undefined,
        observacao: linha.observacao || undefined,

        classificacao: linha.classificacao,
        desvioIdentificado:
            linha.desvio_identificado === null || linha.desvio_identificado === undefined
                ? null
                : !!linha.desvio_identificado,
        status: linha.tratamento || "pendente",
        criadoEm: linha.criado_em,
        atualizadoEm: linha.atualizado_em,
    };
}

// O que o analista pode gravar. Nada fora desta lista chega ao banco por PATCH -
// dado do SGF so entra pelo lote, nunca pela tela.
const CAMPOS_DO_ANALISTA = {
    foto: "foto",
    comp1: "comp1",
    comp2: "comp2",
    comp3: "comp3",
    fueiro1: "fueiro1",
    fueiro2: "fueiro2",
    fueiro3: "fueiro3",
    observacao: "observacao",
    desvioIdentificado: "desvio_identificado",
    status: "tratamento",
};

const STATUS_VALIDOS = ["pendente", "tratada", "enviada"];

/** Objeto vindo da tela -> colunas do banco, so com o que o analista pode mudar. */
function paraBanco(corpo = {}) {
    const mudancas = {};
    for (const [campo, coluna] of Object.entries(CAMPOS_DO_ANALISTA)) {
        if (!(campo in corpo)) continue;
        let valor = corpo[campo];

        if (coluna === "tratamento") {
            if (!STATUS_VALIDOS.includes(valor)) continue;
        } else if (coluna.startsWith("fueiro")) {
            valor = !!valor;
        } else if (coluna.startsWith("comp")) {
            valor = valor === null || valor === "" ? null : Number(valor);
            if (valor !== null && !Number.isFinite(valor)) continue;
        } else if (coluna === "desvio_identificado") {
            valor = valor === null ? null : !!valor;
        }
        mudancas[coluna] = valor;
    }
    return mudancas;
}

module.exports = { paraFront, paraBanco, CAMPOS_DO_ANALISTA };
