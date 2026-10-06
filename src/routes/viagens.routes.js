const { Router } = require("express");
const ViagensController = require("../controllers/ViagensController");
const ensureApiKey = require("../middlewares/ensureApiKey");

const viagensRoutes = Router();
const viagensController = new ViagensController();

// rotas fixas antes da rota com parametro, senao "/estatisticas" seria lido como guia
viagensRoutes.get("/estatisticas", ensureApiKey, viagensController.estatisticas);
viagensRoutes.get("/fila", ensureApiKey, viagensController.fila);
viagensRoutes.get("/resumo", ensureApiKey, viagensController.resumo);

viagensRoutes.get("/", ensureApiKey, viagensController.index);
viagensRoutes.post("/", ensureApiKey, viagensController.create);
viagensRoutes.delete("/", ensureApiKey, viagensController.destroy);
viagensRoutes.patch("/:guia", ensureApiKey, viagensController.update);

module.exports = viagensRoutes;
