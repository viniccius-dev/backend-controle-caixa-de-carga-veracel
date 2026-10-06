import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { abrirBanco } from './banco.js';
import { processarMensagem } from './mensagem.js';

const CFG = {
  host: process.env.IMAP_HOST || 'imap.gmail.com',
  port: Number(process.env.IMAP_PORTA || 993),
  usuario: process.env.IMAP_USUARIO || '',
  senha: process.env.IMAP_SENHA || '',
  caixa: process.env.IMAP_CAIXA || 'INBOX',
  processados: process.env.IMAP_PASTA_OK || 'Processados',
  erros: process.env.IMAP_PASTA_ERRO || 'Erros',
  remetentes: (process.env.REMETENTES_AUTORIZADOS || '').split(','),
  codigo: process.env.CODIGO_ENVIO || '',
  intervalo: Number(process.env.LEITOR_INTERVALO_SEG || 120),
  banco: process.env.BANCO || './dados/alerta-cx-carga.db'
};

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

async function garantirPasta(client, nome) {
  try { await client.mailboxCreate(nome); } catch { /* ja existe */ }
}

/** Uma passada: le as nao lidas, processa e arquiva. */
export async function rodarUmaVez(db) {
  if (!CFG.usuario || !CFG.senha) throw new Error('Defina IMAP_USUARIO e IMAP_SENHA no .env');

  const client = new ImapFlow({
    host: CFG.host, port: CFG.port, secure: true,
    auth: { user: CFG.usuario, pass: CFG.senha },
    logger: false
  });

  const contagem = { lidas: 0, ok: 0, recusadas: 0, falhas: 0 };
  await client.connect();
  try {
    await garantirPasta(client, CFG.processados);
    await garantirPasta(client, CFG.erros);

    const trava = await client.getMailboxLock(CFG.caixa);
    try {
      // { uid: true } e obrigatorio: sem isso o search devolve numero de sequencia,
      // que deixa de bater com o UID assim que qualquer mensagem sai da caixa
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) { log('nenhuma mensagem nova'); return contagem; }
      log(`${uids.length} mensagem(ns) nao lida(s)`);

      for (const uid of uids) {
        contagem.lidas++;
        let destino = CFG.erros;
        try {
          const baixado = await client.download(uid, undefined, { uid: true });
          if (!baixado?.content) throw new Error(`nao consegui baixar o conteudo do uid ${uid}`);
          const content = baixado.content;
          const r = await processarMensagem(content, db, {
            remetentes: CFG.remetentes, codigo: CFG.codigo
          });

          if (r.ok) {
            contagem.ok++;
            destino = CFG.processados;
            log(`ok  ${r.arquivo} | criadas ${r.resumo.criadas} | atualizadas ${r.resumo.atualizadas}` +
                ` | sem mudanca ${r.resumo.semMudanca} | rejeitadas ${r.resumo.rejeitadas.length}`);
            if (r.resumo.rejeitadas.length) {
              log('    rejeitadas:', JSON.stringify(r.resumo.rejeitadas.slice(0, 5)));
            }
          } else {
            contagem.recusadas++;
            log(`recusada: ${r.motivo} | de ${r.de} | assunto "${r.assunto}"`);
          }
        } catch (e) {
          contagem.falhas++;
          log('falha ao processar uid', uid, '-', e.message);
        }

        // marcar como lida e tirar da caixa de entrada: a proxima passada nao reprocessa.
        // Se o arquivamento falhar, a marca de lida ja impede o laco infinito.
        try {
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          await client.messageMove(uid, destino, { uid: true });
        } catch (e) {
          log('aviso: nao consegui arquivar uid', uid, '-', e.message);
        }
      }
    } finally {
      trava.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return contagem;
}

if (process.argv[1]?.endsWith('leitor-email.js')) {
  mkdirSync(dirname(CFG.banco), { recursive: true });
  const db = abrirBanco(CFG.banco);
  const umaVez = process.argv.includes('--once');

  const ciclo = async () => {
    try { await rodarUmaVez(db); }
    catch (e) { log('erro no ciclo:', e.message); }
  };

  await ciclo();
  if (umaVez) { db.close(); process.exit(0); }

  log(`leitor ativo, checando a cada ${CFG.intervalo}s`);
  setInterval(ciclo, CFG.intervalo * 1000);
}
