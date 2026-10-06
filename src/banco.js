import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

export const PBT_BASE = 74000;

/** Remove sufixo de estado e pontuacao final: "SERRANALOG ... LTDA - MG" e
 *  "SERRANALOG ... LTDA." passam a contar como a mesma transportadora. */
export function normalizarFornecedor(nome) {
  if (!nome) return null;
  return String(nome)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*-\s*[A-Z]{2}\s*$/i, '')
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function classificar(pbt, pbtBase = PBT_BASE) {
  if (pbt == null || !Number.isFinite(pbt)) return 'em_transito';
  return pbt < pbtBase ? 'com_desvio' : 'sem_desvio';
}

export function abrirBanco(caminho) {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(AQUI, 'schema.sql'), 'utf8'));
  return db;
}

// Campos que chegam do SGF. Vazio nunca apaga valor ja gravado.
const CAMPOS = {
  serie: 'serie',
  numeroDocumento: 'numero_documento',
  fornecedor: 'fornecedor',
  placa: 'placa',
  rmt: 'rmt',
  tipoConjunto: 'tipo_conjunto',
  dataInicioViagem: 'data_inicio_viagem',
  projeto: 'projeto',
  talhao: 'talhao',
  localCarregamento: 'local_carregamento',
  uo: 'uo',
  distancia: 'distancia',
  situacao: 'situacao',
  grua: 'grua',
  dataChegadaBalanca: 'data_chegada_balanca',
  pbt: 'pbt',
  volume: 'volume'
};

const vazio = (v) => v === undefined || v === null || v === '';

/** Valida uma viagem do lote. Devolve null quando esta ok, ou o motivo da rejeicao. */
export function validar(v) {
  if (!v || typeof v !== 'object') return 'registro nao e um objeto';
  if (vazio(v.guia)) return 'guia ausente';
  if (!/^[0-9]+-[0-9]+$/.test(String(v.guia).trim())) return `guia em formato inesperado: "${v.guia}"`;
  if (vazio(v.dataInicioViagem)) return 'dataInicioViagem ausente';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(v.dataInicioViagem)))
    return `dataInicioViagem invalida: "${v.dataInicioViagem}"`;
  for (const campo of ['pbt', 'volume', 'distancia']) {
    if (!vazio(v[campo]) && !Number.isFinite(Number(v[campo])))
      return `${campo} nao e numerico: "${v[campo]}"`;
  }
  if (!vazio(v.volume) && Number(v.volume) <= 0) return 'volume deve ser maior que zero';
  if (!vazio(v.pbt) && Number(v.pbt) <= 0) return 'pbt deve ser maior que zero';
  return null;
}

/**
 * Grava um lote de viagens. Idempotente por guia.
 *
 * Regras (contrato v1):
 *  - guia nova: cria;
 *  - guia existente: atualiza campo a campo;
 *  - campo vazio no envio NUNCA apaga valor ja gravado;
 *  - viagem ja tratada pelo analista mantem foto, percentuais e estado de tratamento;
 *  - classificacao e sempre recalculada a partir do PBT corrente.
 */
export function gravarLote(db, viagens, { origem = null, transporte = 'http', referencia = null } = {}) {
  const agora = new Date().toISOString().slice(0, 19);
  const resumo = { recebidas: viagens.length, criadas: 0, atualizadas: 0, semMudanca: 0, rejeitadas: [] };

  const buscar = db.prepare('SELECT * FROM viagens WHERE guia = ?');
  const inserir = db.prepare(`
    INSERT INTO viagens (guia, serie, numero_documento, fornecedor, fornecedor_norm, placa, rmt,
      tipo_conjunto, data_inicio_viagem, projeto, talhao, local_carregamento, uo, distancia,
      situacao, grua, data_chegada_balanca, pbt, volume, pbt_base, classificacao, tratamento,
      criado_em, atualizado_em)
    VALUES (@guia, @serie, @numero_documento, @fornecedor, @fornecedor_norm, @placa, @rmt,
      @tipo_conjunto, @data_inicio_viagem, @projeto, @talhao, @local_carregamento, @uo, @distancia,
      @situacao, @grua, @data_chegada_balanca, @pbt, @volume, @pbt_base, @classificacao, 'pendente',
      @agora, @agora)`);

  const aplicar = db.transaction((lista) => {
    for (const bruta of lista) {
      const motivo = validar(bruta);
      if (motivo) {
        resumo.rejeitadas.push({ guia: bruta?.guia ?? null, motivo });
        continue;
      }
      const guia = String(bruta.guia).trim();
      const atual = buscar.get(guia);

      if (!atual) {
        const linha = { guia, agora, pbt_base: PBT_BASE };
        for (const [campo, coluna] of Object.entries(CAMPOS)) {
          linha[coluna] = vazio(bruta[campo]) ? null : bruta[campo];
        }
        linha.fornecedor_norm = normalizarFornecedor(linha.fornecedor);
        linha.classificacao = classificar(linha.pbt, PBT_BASE);
        inserir.run(linha);
        resumo.criadas++;
        continue;
      }

      // campo vazio nao apaga: so entra no UPDATE o que veio preenchido e mudou
      const mudancas = {};
      for (const [campo, coluna] of Object.entries(CAMPOS)) {
        const novo = bruta[campo];
        if (vazio(novo)) continue;
        if (String(atual[coluna] ?? '') === String(novo)) continue;
        mudancas[coluna] = novo;
      }
      // so recalcula o normalizado quando o proprio fornecedor mudou, senao
      // todo reenvio identico contaria como atualizacao
      if ('fornecedor' in mudancas) {
        mudancas.fornecedor_norm = normalizarFornecedor(mudancas.fornecedor);
      }

      const pbtFinal = 'pbt' in mudancas ? mudancas.pbt : atual.pbt;
      const classeNova = classificar(pbtFinal, atual.pbt_base ?? PBT_BASE);
      if (classeNova !== atual.classificacao) mudancas.classificacao = classeNova;

      if (Object.keys(mudancas).length === 0) { resumo.semMudanca++; continue; }

      // o trabalho do analista nunca e sobrescrito por um envio do SGF
      delete mudancas.foto; delete mudancas.comp1; delete mudancas.comp2;
      delete mudancas.comp3; delete mudancas.tratamento;

      mudancas.atualizado_em = agora;
      const sets = Object.keys(mudancas).map((c) => `${c} = @${c}`).join(', ');
      db.prepare(`UPDATE viagens SET ${sets} WHERE guia = @guia`).run({ ...mudancas, guia });
      resumo.atualizadas++;
    }
  });

  aplicar(viagens);

  db.prepare(`INSERT INTO recebimentos (recebido_em, origem, transporte, referencia,
      recebidas, criadas, atualizadas, sem_mudanca, rejeitadas, detalhe)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    agora, origem, transporte, referencia, resumo.recebidas, resumo.criadas,
    resumo.atualizadas, resumo.semMudanca, resumo.rejeitadas.length,
    resumo.rejeitadas.length ? JSON.stringify(resumo.rejeitadas.slice(0, 50)) : null
  );

  return resumo;
}
