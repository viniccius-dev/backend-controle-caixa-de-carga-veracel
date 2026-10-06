import 'dotenv/config';
import express from 'express';
import { abrirBanco, gravarLote } from './banco.js';

const PORTA = Number(process.env.PORTA || 3001);
const CHAVE = process.env.API_KEY || '';
const BANCO = process.env.BANCO || './dados/alerta-cx-carga.db';
const MAX_LOTE = Number(process.env.MAX_LOTE || 500);

export function criarApp(db) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Sem autenticacao de proposito: e o alvo do teste de conectividade.
  app.get('/api/v1/saude', (_req, res) => res.json({ ok: true, agora: new Date().toISOString() }));

  app.post('/api/v1/viagens', (req, res) => {
    if (!CHAVE || req.get('X-API-Key') !== CHAVE) {
      return res.status(401).json({ ok: false, erro: 'chave invalida ou ausente' });
    }
    const corpo = req.body || {};
    const viagens = corpo.viagens;
    if (!Array.isArray(viagens) || viagens.length === 0) {
      return res.status(400).json({ ok: false, erro: 'campo viagens ausente ou vazio' });
    }
    if (viagens.length > MAX_LOTE) {
      return res.status(413).json({ ok: false, erro: `lote acima de ${MAX_LOTE} viagens`, limite: MAX_LOTE });
    }
    try {
      const resumo = gravarLote(db, viagens, {
        origem: corpo.origem ?? null,
        transporte: corpo.transporte ?? 'http',
        referencia: corpo.referencia ?? null
      });
      return res.json({ ok: true, ...resumo });
    } catch (e) {
      console.error('[viagens] falha ao gravar lote:', e);
      return res.status(500).json({ ok: false, erro: 'falha ao gravar o lote' });
    }
  });

  return app;
}

if (process.argv[1]?.endsWith('index.js')) {
  if (!CHAVE) { console.error('Defina API_KEY no .env antes de subir o servidor.'); process.exit(1); }
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(BANCO), { recursive: true });
  const db = abrirBanco(BANCO);
  criarApp(db).listen(PORTA, () => console.log(`API ouvindo em http://127.0.0.1:${PORTA}`));
}
