// Testa as rotas HTTP que a plataforma consome: listagem, atualizacao pelo
// analista, exclusao e estatisticas do periodo.
process.env.NODE_ENV = "development";
process.env.BANCO = require("node:path").join(require("node:os").tmpdir(), `cx-rotas-${Date.now()}.db`);
process.env.API_KEY = "chave-de-teste";
process.env.LEITOR_ATIVO = "false";
process.env.PORTA = "0";

const { rmSync } = require("node:fs");
const knex = require("../src/database/knex");

let falhas = 0;
const conferir = (nome, obtido, esperado) => {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    if (!ok) falhas++;
    console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : `\n      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`}`);
};

(async () => {
    await knex.migrate.latest();

    const express = require("express");
    require("express-async-errors");
    const AppError = require("../src/utils/AppError");
    const routes = require("../src/routes");
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(routes);
    app.use((error, _req, res, _next) => {
        if (error instanceof AppError) return res.status(error.statusCode).json({ ok: false, erro: error.message });
        console.error(error);
        return res.status(500).json({ ok: false, erro: "falha interna" });
    });

    const servidor = app.listen(0);
    const base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
    const chamar = (caminho, opcoes = {}) =>
        fetch(`${base}${caminho}`, {
            ...opcoes,
            headers: { "Content-Type": "application/json", "X-API-Key": "chave-de-teste", ...(opcoes.headers || {}) },
        });

    // base: 2 com desvio, 1 sem desvio, 1 em transito
    const viagem = (guia, pbt, volume, extra = {}) => ({
        guia, serie: guia.split("-")[0], numeroDocumento: Number(guia.split("-")[1]),
        fornecedor: "SERRANALOG TRANSPORTES LTDA - BA",
        dataInicioViagem: "2026-10-01T08:00:00",
        dataChegadaBalanca: "2026-10-01T14:00:00",
        projeto: "Bandaia", talhao: "012-01", placa: "TOL-2D46", rmt: "1553",
        grua: "SRL-02", distancia: 80, tipoConjunto: "Tri-trem",
        pbt, volume, ...extra,
    });

    let r = await (await chamar("/viagens", {
        method: "POST",
        body: JSON.stringify({ origem: "teste", viagens: [
            viagem("3-900001", 70000, 50),
            viagem("3-900002", 71000, 55),
            viagem("3-900003", 70000, 63),
            { ...viagem("3-900004", null, null), fornecedor: "JSL S/A - BA" },
        ] }),
    })).json();
    conferir("POST grava o lote", [r.criadas, r.rejeitadas.length], [4, 0]);

    // listagem devolve so o que tem desvio, ja no formato do front
    let lista = await (await chamar("/viagens")).json();
    conferir("GET lista so viagens com desvio", lista.length, 2);
    conferir("campos traduzidos para o front",
        [lista[0].alertaId !== undefined, lista[0].pbtReal > 0, lista[0].volumeCarga > 0, lista[0].equipamento],
        [true, true, true, "TOL-2D46"]);
    conferir("fueiro comeca nao conforme", [lista[0].fueiro1, lista[0].fueiro2, lista[0].fueiro3], [false, false, false]);
    conferir("desvio identificado comeca pendente", lista[0].desvioIdentificado, null);

    lista = await (await chamar("/viagens?classificacao=todas")).json();
    conferir("classificacao=todas traz tudo", lista.length, 4);

    // o analista responde
    let v = await (await chamar("/viagens/3-900001", {
        method: "PATCH",
        body: JSON.stringify({ comp1: 0, comp2: 0, comp3: 8, fueiro1: true, fueiro2: true, fueiro3: false,
            desvioIdentificado: true, foto: "data:image/jpeg;base64,abc", status: "tratada" }),
    })).json();
    conferir("PATCH grava o trabalho do analista",
        [v.comp3, v.fueiro1, v.fueiro3, v.desvioIdentificado, v.status, v.foto?.slice(0, 10)],
        [8, true, false, true, "tratada", "data:image"]);

    // um envio novo do SGF nao desfaz o que o analista gravou
    await chamar("/viagens", { method: "POST", body: JSON.stringify({ viagens: [viagem("3-900001", 70500, 51)] }) });
    v = (await (await chamar("/viagens")).json()).find((x) => x.alertaId === "3-900001");
    conferir("reenvio do SGF preserva o analista", [v.comp3, v.desvioIdentificado, v.pbtReal], [8, true, 70500]);

    // campo que nao e do analista e ignorado no PATCH
    r = await chamar("/viagens/3-900002", { method: "PATCH", body: JSON.stringify({ pbtReal: 1, volumeCarga: 1 }) });
    conferir("PATCH recusa campo que nao e do analista", r.status, 400);

    r = await chamar("/viagens/9-999999", { method: "PATCH", body: JSON.stringify({ comp1: 1 }) });
    conferir("PATCH em guia inexistente responde 404", r.status, 404);

    // estatisticas: o denominador que faltava
    const est = await (await chamar("/viagens/estatisticas?de=2026-10-01&ate=2026-10-01")).json();
    conferir("estatisticas trazem o total do periodo", [est.totalViagens, est.comDesvio], [4, 2]);
    conferir("estatisticas separam por fornecedor",
        est.fornecedores.map((f) => [f.fornecedor, f.viagens, f.comDesvio]),
        [["SERRANALOG TRANSPORTES LTDA", 3, 2], ["JSL S/A", 1, 0]]);

    const vazio = await (await chamar("/viagens/estatisticas?de=2020-01-01&ate=2020-12-31")).json();
    conferir("periodo sem viagens nao quebra", [vazio.totalViagens, vazio.comDesvio], [0, 0]);

    // exclusao
    r = await (await chamar("/viagens?guias=3-900003", { method: "DELETE" })).json();
    conferir("DELETE remove a viagem", r.excluidas, 1);

    // seguranca
    r = await fetch(`${base}/viagens`, { headers: { "X-API-Key": "errada" } });
    conferir("sem chave valida responde 401", r.status, 401);

    servidor.close();
    await knex.destroy();
    for (const s of ["", "-wal", "-shm"]) rmSync(process.env.BANCO + s, { force: true });
    console.log(falhas ? `\n${falhas} falha(s)` : "\nTodos os testes passaram.");
    process.exit(falhas ? 1 : 0);
})();
