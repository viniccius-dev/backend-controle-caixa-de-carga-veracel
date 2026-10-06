/**
 * Parametros do negocio. Validados contra a planilha oficial da gestao -
 * qualquer mudanca aqui altera todos os indicadores do painel.
 */
module.exports = {
    PBT_BASE: 74000,     // kg - limite contratual (SLA)
    PBT_MAX: 77700,      // kg - limite legal com tolerancia de 5%
    VOLUME_META: 62,     // m3 - caixa cheia
    MAX_LOTE: Number(process.env.MAX_LOTE || 500),
};
