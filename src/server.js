require("express-async-errors");
require("dotenv/config");
require("./jobs/leitorEmail");

const express = require("express");
const cors = require("cors");

const AppError = require("./utils/AppError");
const routes = require("./routes");

const PORTA = Number(process.env.PORTA || 3001);

const app = express();

// A plataforma roda em outro endereco, entao o navegador exige CORS liberado.
// ORIGENS_PERMITIDAS vazio = libera tudo (desenvolvimento).
const origens = (process.env.ORIGENS_PERMITIDAS || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(origens.length ? { origin: origens } : {}));
app.use(express.json({ limit: "10mb" }));
app.use(routes);

app.use((error, _request, response, _next) => {
    if (error instanceof AppError) {
        return response.status(error.statusCode).json({ ok: false, erro: error.message, ...error.extras });
    }
    console.error(error);
    return response.status(500).json({ ok: false, erro: "falha interna no servidor" });
});

app.listen(PORTA, () => console.log(`API ouvindo em http://127.0.0.1:${PORTA}`));

module.exports = app;
