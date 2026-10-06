// Testa as regras de gravacao com 400 viagens reais da planilha de ciclo.
// Roda em banco temporario, aplicando as mesmas migrations do servidor.
process.env.NODE_ENV = "development";
process.env.BANCO = require("node:path").join(require("node:os").tmpdir(), `cx-${Date.now()}.db`);
process.env.API_KEY = "chave-de-teste";
process.env.LEITOR_ATIVO = "false";

const { readFileSync, rmSync } = require("node:fs");
const knex = require("../src/database/knex");
const ViagensRepository = require("../src/repositories/ViagensRepository");
const RecebimentosRepository = require("../src/repositories/RecebimentosRepository");
const ViagensService = require("../src/services/ViagensService");

let falhas = 0;
const conferir = (nome, obtido, esperado) => {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    if (!ok) falhas++;
    console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : `\n      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`}`);
};

(async () => {
    await knex.migrate.latest();
    const service = new ViagensService(new ViagensRepository(), new RecebimentosRepository());
    const enviar = (viagens) => service.gravarLote(viagens, { origem: "teste" });
    const conta = (where) => knex("viagens").where(where).count({ n: "*" }).first().then((r) => r.n);
    const viagem = (guia) => knex("viagens").where({ guia }).first();

    const viagens = JSON.parse(readFileSync(`${__dirname}/lote-real.json`, "utf8"));

    // 1. primeiro envio
    let r = await enviar(viagens);
    conferir("primeiro envio cria tudo", [r.criadas, r.atualizadas, r.rejeitadas.length], [400, 0, 0]);

    const naFila = viagens.filter((v) => v.volume < 62 && v.pbt < 74000).length;
    conferir("regra da fila aplicada ao lote real", await conta({ classificacao: "com_desvio" }), naFila);
    console.log(`     ${naFila} de 400 viagens reais entram na fila`);

    // 2. idempotencia
    r = await enviar(viagens);
    conferir("reenvio identico nao duplica", [await conta({}), r.criadas, r.semMudanca], [400, 0, 400]);

    // 3. regra da fila, caso a caso
    const nova = (guia, pbt, volume) => ({ guia, dataInicioViagem: "2026-09-26T08:00:00", fornecedor: "X", projeto: "P", pbt, volume });
    await enviar([
        nova("8-000001", 70000, 50),   // sobrou espaco e sobrou peso -> fila
        nova("8-000002", 70000, 63),   // caixa cheia -> fora
        nova("8-000003", 75000, 50),   // peso no limite -> fora
        nova("8-000004", 70000, null), // sem volume -> em transito
    ]);
    const est = async (g) => { const v = await viagem(g); return [v.classificacao, v.desvio_identificado]; };
    conferir("entra na fila e fica pendente de resposta", await est("8-000001"), ["com_desvio", null]);
    conferir("caixa cheia nao entra e ja responde nao", await est("8-000002"), ["sem_desvio", 0]);
    conferir("peso no limite nao entra", await est("8-000003"), ["sem_desvio", 0]);
    conferir("sem volume fica em transito", await est("8-000004"), ["em_transito", 0]);

    // 4. preenchimento progressivo
    await enviar([nova("8-000004", 70000, 55)]);
    conferir("volume chegando depois joga para a fila", await est("8-000004"), ["com_desvio", null]);

    // 5. trabalho do analista preservado
    await knex("viagens").where({ guia: "8-000001" })
        .update({ desvio_identificado: true, comp3: 8, foto: "base64...", tratamento: "tratada" });
    await enviar([nova("8-000001", 70500, 51)]);
    const v1 = await viagem("8-000001");
    conferir("analista preservado, dados do SGF atualizados",
        [v1.desvio_identificado, v1.comp3, v1.foto, v1.pbt], [1, 8, "base64...", 70500]);

    // 6. vazio nao apaga
    await enviar([{ ...nova("8-000001", null, null), grua: null }]);
    const v2 = await viagem("8-000001");
    conferir("vazio nao apaga valor gravado", [v2.pbt, v2.volume], [70500, 51]);

    // 7. normalizacao de fornecedor
    await enviar([{ ...nova("8-000010", 70000, 50), fornecedor: "SERRANALOG TRANSPORTES LTDA - MG" }]);
    conferir("fornecedor sem sufixo de estado", (await viagem("8-000010")).fornecedor_norm, "SERRANALOG TRANSPORTES LTDA");

    // 8. rejeicoes nao derrubam o lote
    r = await enviar([
        nova("8-000020", 70000, 50),
        { guia: "invalida", dataInicioViagem: "2026-09-26T09:00:00" },
        { guia: "8-000021", dataInicioViagem: "00/00/0000" },
        { ...nova("8-000022", 70000, 0) },
    ]);
    conferir("valida grava, invalidas retornam motivo", [r.criadas, r.rejeitadas.length], [1, 3]);

    // 9. limites
    try { await enviar([]); conferir("lote vazio e recusado", "sem erro", "erro"); }
    catch (e) { conferir("lote vazio e recusado", e.statusCode, 400); }
    try { await enviar(Array(501).fill(nova("8-000030", 70000, 50))); conferir("lote grande e recusado", "sem erro", "erro"); }
    catch (e) { conferir("lote grande e recusado", e.statusCode, 413); }

    // 10. auditoria
    const rec = await knex("recebimentos").count({ n: "*" }).first();
    conferir("todo lote aceito fica registrado", rec.n > 0, true);

    await knex.destroy();
    for (const sufixo of ["", "-wal", "-shm"]) rmSync(process.env.BANCO + sufixo, { force: true });
    console.log(falhas ? `\n${falhas} falha(s)` : "\nTodos os testes passaram.");
    process.exit(falhas ? 1 : 0);
})();
