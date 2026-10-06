const AppError = require("../utils/AppError");
const { normalizarFornecedor } = require("../utils/fornecedor");
const { PBT_BASE, VOLUME_META, MAX_LOTE } = require("../configs/regras");

// Campos que chegam do SGF. Vazio nunca apaga valor ja gravado.
const CAMPOS = {
    serie: "serie",
    numeroDocumento: "numero_documento",
    fornecedor: "fornecedor",
    placa: "placa",
    rmt: "rmt",
    tipoConjunto: "tipo_conjunto",
    dataInicioViagem: "data_inicio_viagem",
    projeto: "projeto",
    talhao: "talhao",
    localCarregamento: "local_carregamento",
    uo: "uo",
    distancia: "distancia",
    situacao: "situacao",
    grua: "grua",
    dataChegadaBalanca: "data_chegada_balanca",
    pbt: "pbt",
    volume: "volume",
};

const vazio = (v) => v === undefined || v === null || v === "";

/**
 * Estagio da viagem.
 *  em_transito - ainda nao pesou ou nao cubou: nao da para avaliar
 *  com_desvio  - sobrou espaco (volume < meta) E sobrou peso (pbt < base): vai para a fila
 *  sem_desvio  - encheu a caixa ou atingiu o peso: nao ha o que avaliar
 */
function classificar(pbt, volume, pbtBase = PBT_BASE, volumeMeta = VOLUME_META) {
    const temPbt = pbt != null && Number.isFinite(Number(pbt));
    const temVol = volume != null && Number.isFinite(Number(volume));
    if (!temPbt || !temVol) return "em_transito";
    return Number(volume) < volumeMeta && Number(pbt) < pbtBase ? "com_desvio" : "sem_desvio";
}

/** Valida uma viagem do lote. null quando esta ok, ou o motivo da rejeicao. */
function validar(v) {
    if (!v || typeof v !== "object") return "registro nao e um objeto";
    if (vazio(v.guia)) return "guia ausente";
    if (!/^[0-9]+-[0-9]+$/.test(String(v.guia).trim())) return `guia em formato inesperado: "${v.guia}"`;
    if (vazio(v.dataInicioViagem)) return "dataInicioViagem ausente";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(v.dataInicioViagem)))
        return `dataInicioViagem invalida: "${v.dataInicioViagem}"`;
    for (const campo of ["pbt", "volume", "distancia"]) {
        if (!vazio(v[campo]) && !Number.isFinite(Number(v[campo]))) return `${campo} nao e numerico: "${v[campo]}"`;
    }
    if (!vazio(v.volume) && Number(v.volume) <= 0) return "volume deve ser maior que zero";
    if (!vazio(v.pbt) && Number(v.pbt) <= 0) return "pbt deve ser maior que zero";
    return null;
}

class ViagensService {
    constructor(viagensRepository, recebimentosRepository) {
        this.viagensRepository = viagensRepository;
        this.recebimentosRepository = recebimentosRepository;
    }

    /**
     * Grava um lote. Idempotente por guia.
     *  - guia nova: cria; guia existente: atualiza campo a campo;
     *  - campo vazio NUNCA apaga valor ja gravado;
     *  - foto, percentuais e resposta do analista nao sao sobrescritos pelo SGF;
     *  - classificacao e recalculada a cada envio, a partir de PBT e volume correntes.
     */
    async gravarLote(viagens, { origem = null, transporte = "http", referencia = null } = {}) {
        if (!Array.isArray(viagens) || viagens.length === 0) {
            throw new AppError("campo viagens ausente ou vazio", 400);
        }
        if (viagens.length > MAX_LOTE) {
            throw new AppError(`lote acima de ${MAX_LOTE} viagens`, 413, { limite: MAX_LOTE });
        }

        const agora = new Date().toISOString().slice(0, 19);
        const resumo = { recebidas: viagens.length, criadas: 0, atualizadas: 0, semMudanca: 0, rejeitadas: [] };

        await this.viagensRepository.transacao(async (trx) => {
            for (const bruta of viagens) {
                const motivo = validar(bruta);
                if (motivo) {
                    resumo.rejeitadas.push({ guia: bruta?.guia ?? null, motivo });
                    continue;
                }

                const guia = String(bruta.guia).trim();
                const atual = await this.viagensRepository.buscarPorGuia(guia, trx);

                if (!atual) {
                    const linha = { guia, pbt_base: PBT_BASE, criado_em: agora, atualizado_em: agora };
                    for (const [campo, coluna] of Object.entries(CAMPOS)) {
                        linha[coluna] = vazio(bruta[campo]) ? null : bruta[campo];
                    }
                    linha.fornecedor_norm = normalizarFornecedor(linha.fornecedor);
                    linha.classificacao = classificar(linha.pbt, linha.volume);
                    // fora da regra da fila ja nasce respondida; dentro dela fica pendente do analista
                    linha.desvio_identificado = linha.classificacao === "com_desvio" ? null : false;
                    linha.tratamento = "pendente";
                    await this.viagensRepository.inserir(linha, trx);
                    resumo.criadas++;
                    continue;
                }

                const mudancas = {};
                for (const [campo, coluna] of Object.entries(CAMPOS)) {
                    const novo = bruta[campo];
                    if (vazio(novo)) continue;
                    if (String(atual[coluna] ?? "") === String(novo)) continue;
                    mudancas[coluna] = novo;
                }
                // so recalcula o normalizado quando o proprio fornecedor mudou, senao todo
                // reenvio identico contaria como atualizacao
                if ("fornecedor" in mudancas) mudancas.fornecedor_norm = normalizarFornecedor(mudancas.fornecedor);

                const pbtFinal = "pbt" in mudancas ? mudancas.pbt : atual.pbt;
                const volFinal = "volume" in mudancas ? mudancas.volume : atual.volume;
                const classeNova = classificar(pbtFinal, volFinal, atual.pbt_base ?? PBT_BASE);
                if (classeNova !== atual.classificacao) {
                    mudancas.classificacao = classeNova;
                    // deixou de ser caso de fila: resposta vira nao, automaticamente.
                    // virou caso de fila: volta a ficar pendente, se o analista ainda nao respondeu.
                    if (classeNova !== "com_desvio") mudancas.desvio_identificado = false;
                    else if (atual.tratamento === "pendente") mudancas.desvio_identificado = null;
                }

                if (Object.keys(mudancas).length === 0) { resumo.semMudanca++; continue; }

                // o trabalho do analista nunca e sobrescrito por um envio do SGF
                delete mudancas.foto; delete mudancas.comp1; delete mudancas.comp2;
                delete mudancas.comp3; delete mudancas.tratamento;
                if (atual.tratamento !== "pendente") delete mudancas.desvio_identificado;

                mudancas.atualizado_em = agora;
                await this.viagensRepository.atualizar(guia, mudancas, trx);
                resumo.atualizadas++;
            }
        });

        await this.recebimentosRepository.registrar({
            recebido_em: agora,
            origem,
            transporte,
            referencia,
            recebidas: resumo.recebidas,
            criadas: resumo.criadas,
            atualizadas: resumo.atualizadas,
            sem_mudanca: resumo.semMudanca,
            rejeitadas: resumo.rejeitadas.length,
            detalhe: resumo.rejeitadas.length ? JSON.stringify(resumo.rejeitadas.slice(0, 50)) : null,
        });

        return resumo;
    }
}

module.exports = ViagensService;
module.exports.classificar = classificar;
module.exports.validar = validar;
