/**
 * Remove sufixo de estado e pontuacao final para agrupar a mesma transportadora:
 * "SERRANALOG TRANSPORTES LTDA - MG" e "SERRANALOG TRANSPORTES LTDA." viram o mesmo nome.
 */
function normalizarFornecedor(nome) {
    if (!nome) return null;
    return String(nome)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s*-\s*[A-Z]{2}\s*$/i, "")
        .replace(/[.\s]+$/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

module.exports = { normalizarFornecedor };
