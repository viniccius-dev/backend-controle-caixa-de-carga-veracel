require("dotenv/config");
const { ImapFlow } = require("imapflow");
const schedule = require("node-schedule");

const ViagensRepository = require("../repositories/ViagensRepository");
const RecebimentosRepository = require("../repositories/RecebimentosRepository");
const ViagensService = require("../services/ViagensService");
const EmailService = require("../services/EmailService");

const CFG = {
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.IMAP_PORTA || 993),
    usuario: process.env.IMAP_USUARIO || "",
    senha: process.env.IMAP_SENHA || "",
    caixa: process.env.IMAP_CAIXA || "INBOX",
    processados: process.env.IMAP_PASTA_OK || "Processados",
    erros: process.env.IMAP_PASTA_ERRO || "Erros",
    remetentes: (process.env.REMETENTES_AUTORIZADOS || "").split(","),
    codigo: process.env.CODIGO_ENVIO || "",
    cron: process.env.LEITOR_CRON || "*/2 * * * *",
    ativo: String(process.env.LEITOR_ATIVO || "true").toLowerCase() === "true",
    somenteNaoLidas: String(process.env.LEITOR_SOMENTE_NAO_LIDAS || "false").toLowerCase() === "true",
};

const log = (...a) => console.log(`[leitorEmail] ${new Date().toISOString().slice(0, 19)}`, ...a);

async function garantirPasta(client, nome) {
    try { await client.mailboxCreate(nome); } catch { /* ja existe */ }
}

/** Uma passada: le a caixa, processa e arquiva. */
async function rodarUmaVez() {
    if (!CFG.usuario || !CFG.senha) throw new Error("Defina IMAP_USUARIO e IMAP_SENHA no .env");

    const emailService = new EmailService(
        new ViagensService(new ViagensRepository(), new RecebimentosRepository())
    );

    const client = new ImapFlow({
        host: CFG.host, port: CFG.port, secure: true,
        auth: { user: CFG.usuario, pass: CFG.senha },
        logger: false,
    });

    const contagem = { lidas: 0, ok: 0, recusadas: 0, falhas: 0 };
    await client.connect();
    try {
        await garantirPasta(client, CFG.processados);
        await garantirPasta(client, CFG.erros);

        const trava = await client.getMailboxLock(CFG.caixa);
        try {
            // Toda mensagem processada sai da caixa de entrada, entao o que sobra aqui e o
            // que falta processar. Nao da para depender da marca de nao lida: mensagem que a
            // propria conta envia para si mesma ja chega marcada como lida.
            // { uid: true } e obrigatorio: sem isso o search devolve numero de sequencia, que
            // deixa de bater com o UID assim que qualquer mensagem sai da caixa.
            const criterio = CFG.somenteNaoLidas ? { seen: false } : { all: true };
            const uids = await client.search(criterio, { uid: true });

            if (!uids || uids.length === 0) {
                log(`nenhuma mensagem em ${CFG.caixa}`);
                return contagem;
            }
            log(`${uids.length} mensagem(ns) a processar`);

            for (const uid of uids) {
                contagem.lidas++;
                let destino = CFG.erros;
                try {
                    const baixado = await client.download(uid, undefined, { uid: true });
                    if (!baixado?.content) throw new Error(`nao consegui baixar o conteudo do uid ${uid}`);

                    const r = await emailService.processarMensagem(baixado.content, {
                        remetentes: CFG.remetentes, codigo: CFG.codigo,
                    });

                    if (r.ok) {
                        contagem.ok++;
                        destino = CFG.processados;
                        log(`ok ${r.arquivo} | criadas ${r.resumo.criadas} | atualizadas ${r.resumo.atualizadas}` +
                            ` | sem mudanca ${r.resumo.semMudanca} | rejeitadas ${r.resumo.rejeitadas.length}`);
                        if (r.resumo.rejeitadas.length) {
                            log("   rejeitadas:", JSON.stringify(r.resumo.rejeitadas.slice(0, 5)));
                        }
                    } else {
                        contagem.recusadas++;
                        log(`recusada: ${r.motivo} | de ${r.de} | assunto "${r.assunto}"`);
                    }
                } catch (e) {
                    contagem.falhas++;
                    log("falha ao processar uid", uid, "-", e.message);
                }

                // marcar como lida antes de mover: se a movimentacao falhar, a marca ja
                // impede que a mensagem volte para sempre
                try {
                    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
                    await client.messageMove(uid, destino, { uid: true });
                } catch (e) {
                    log("aviso: nao consegui arquivar uid", uid, "-", e.message);
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

async function ciclo() {
    try { await rodarUmaVez(); }
    catch (e) { log("erro no ciclo:", e.message); }
}

if (require.main === module) {
    // execucao avulsa: npm run leitor:once
    ciclo().then(() => process.exit(0));
} else if (CFG.ativo) {
    schedule.scheduleJob(CFG.cron, ciclo);
    log(`agendado (${CFG.cron})`);
}

module.exports = { rodarUmaVez };
