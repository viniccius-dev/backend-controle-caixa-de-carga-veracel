// Testa a leitura de uma mensagem de e-mail de ponta a ponta, sem IMAP:
// monta um e-mail MIME com o anexo gerado pela macro VBA e processa.
process.env.NODE_ENV = "development";
process.env.BANCO = require("node:path").join(require("node:os").tmpdir(), `cx-mail-${Date.now()}.db`);
process.env.LEITOR_ATIVO = "false";

const { readFileSync, rmSync } = require("node:fs");
const knex = require("../src/database/knex");
const ViagensRepository = require("../src/repositories/ViagensRepository");
const RecebimentosRepository = require("../src/repositories/RecebimentosRepository");
const ViagensService = require("../src/services/ViagensService");
const EmailService = require("../src/services/EmailService");

const ANEXO = process.argv[2] || `${__dirname}/lote-real.json`;
const CODIGO = "CODIGO-TESTE";
const DE = "marcos.moby@veracel.com.br";

let falhas = 0;
const conferir = (nome, obtido, esperado) => {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    if (!ok) falhas++;
    console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : `\n      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`}`);
};

/** Monta um e-mail MIME com anexo, como o Outlook envia. */
function email({ de = DE, assunto = `[CXCARGA] ${CODIGO} 2026-10-02 14:33`, nome = "viagens.txt", conteudo }) {
    const b = "----limite123";
    return Buffer.from(
        `From: Marcos <${de}>\r\nTo: torredecontrole.veracel@gmail.com\r\n` +
        `Subject: ${assunto}\r\nMIME-Version: 1.0\r\n` +
        `Content-Type: multipart/mixed; boundary="${b}"\r\n\r\n` +
        `--${b}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nEnvio automatico.\r\n` +
        `--${b}\r\nContent-Type: text/plain; charset=utf-8; name="${nome}"\r\n` +
        `Content-Disposition: attachment; filename="${nome}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        Buffer.from(conteudo, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n") +
        `\r\n--${b}--\r\n`, "utf8");
}

(async () => {
    await knex.migrate.latest();
    const service = new EmailService(new ViagensService(new ViagensRepository(), new RecebimentosRepository()));
    const opc = { remetentes: [DE], codigo: CODIGO };

    const lote = readFileSync(ANEXO, "utf8");
    const dados = JSON.parse(lote);
    const corpo = Array.isArray(dados) ? JSON.stringify({ origem: "teste", viagens: dados }) : lote;

    let r = await service.processarMensagem(email({ conteudo: corpo }), opc);
    conferir("mensagem valida grava o lote", [r.ok, r.resumo.criadas > 0, r.resumo.rejeitadas.length], [true, true, 0]);
    const criadas = r.resumo.criadas;
    console.log(`     ${criadas} viagens criadas a partir do anexo`);

    r = await service.processarMensagem(email({ conteudo: corpo }), opc);
    conferir("reenvio da mesma mensagem nao duplica", [r.resumo.criadas, r.resumo.semMudanca], [0, criadas]);

    r = await service.processarMensagem(email({ conteudo: corpo, de: "estranho@outro.com" }), opc);
    conferir("remetente nao autorizado e recusado", r.ok, false);

    r = await service.processarMensagem(email({ conteudo: corpo, assunto: "sem codigo aqui" }), opc);
    conferir("assunto sem codigo e recusado", r.ok, false);

    r = await service.processarMensagem(email({ conteudo: "isso nao e json" }), opc);
    conferir("anexo invalido nao derruba o leitor", [r.ok, r.motivo.includes("JSON")], [false, true]);

    r = await service.processarMensagem(email({ conteudo: corpo, nome: "planilha.xlsx" }), opc);
    conferir("anexo de outro tipo e ignorado", r.ok, false);

    r = await service.processarMensagem(email({ conteudo: '{"origem":"x","viagens":[]}' }), opc);
    conferir("lote vazio e recusado", r.ok, false);

    r = await service.processarMensagem(email({ conteudo: "\uFEFF" + corpo }), opc);
    conferir("anexo com BOM ainda e lido", r.ok, true);

    await knex.destroy();
    for (const sufixo of ["", "-wal", "-shm"]) rmSync(process.env.BANCO + sufixo, { force: true });
    console.log(falhas ? `\n${falhas} falha(s)` : "\nTodos os testes passaram.");
    process.exit(falhas ? 1 : 0);
})();
