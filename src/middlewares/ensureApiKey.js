const AppError = require("../utils/AppError");

/** Toda escrita exige a chave combinada com a planilha. */
function ensureApiKey(request, _response, next) {
    const chave = process.env.API_KEY;
    if (!chave) throw new AppError("API_KEY nao configurada no servidor", 500);
    if (request.headers["x-api-key"] !== chave) throw new AppError("chave invalida ou ausente", 401);
    return next();
}

module.exports = ensureApiKey;
