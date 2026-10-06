const { Router } = require("express");
const viagensRoutes = require("./viagens.routes");

const routes = Router();

// sem autenticacao de proposito: e o alvo do teste de conectividade da planilha
routes.get("/api/v1/saude", (_request, response) =>
    response.json({ ok: true, agora: new Date().toISOString() })
);

routes.use("/api/v1/viagens", viagensRoutes);

module.exports = routes;
