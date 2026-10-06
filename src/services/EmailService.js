const { simpleParser } = require("mailparser");

const MAX_ANEXO = 8 * 1024 * 1024; // 8 MB - um lote de 500 viagens tem ~170 kB

/** Extrai o endereco de "Fulano <a@b.com>" ou do objeto do mailparser. */
function enderecos(campo) {
    if (!campo) return [];
    if (Array.isArray(campo.value)) return campo.value.map((v) => String(v.address || "").toLowerCase());
    return String(campo.text || campo)
        .split(",")
        .map((t) => (t.match(/<([^>]+)>/)?.[1] || t).trim().toLowerCase());
}

class EmailService {
    constructor(viagensService) {
        this.viagensService = viagensService;
    }

    /**
     * Decide se a mensagem pode ser processada e grava o lote.
     *
     * Qualquer um pode escrever para a caixa, entao sao duas barreiras: o remetente
     * precisa estar autorizado E o assunto precisa trazer o codigo combinado.
     */
    async processarMensagem(bruta, { remetentes = [], codigo = "" } = {}) {
        const msg = await simpleParser(bruta);
        const de = enderecos(msg.from);
        const assunto = msg.subject || "";
        const base = { assunto, de: de[0] || null, messageId: msg.messageId || null };

        const permitidos = remetentes.map((r) => r.trim().toLowerCase()).filter(Boolean);
        if (permitidos.length && !de.some((e) => permitidos.includes(e))) {
            return { ...base, ok: false, motivo: `remetente nao autorizado: ${de.join(", ") || "desconhecido"}` };
        }
        if (codigo && !assunto.includes(codigo)) {
            return { ...base, ok: false, motivo: "assunto sem o codigo de envio" };
        }

        const anexos = (msg.attachments || []).filter((a) => /\.(txt|json)$/i.test(a.filename || ""));
        if (!anexos.length) return { ...base, ok: false, motivo: "mensagem sem anexo .txt ou .json" };

        const anexo = anexos[0];
        if (anexo.size > MAX_ANEXO) return { ...base, ok: false, motivo: `anexo grande demais (${anexo.size} bytes)` };

        let corpo;
        try {
            // o VBA grava UTF-8 sem BOM, mas um BOM que escape quebraria o JSON.parse
            corpo = JSON.parse(anexo.content.toString("utf8").replace(/^\uFEFF/, ""));
        } catch (e) {
            return { ...base, ok: false, motivo: `anexo nao e um JSON valido: ${e.message}` };
        }

        if (!Array.isArray(corpo.viagens) || corpo.viagens.length === 0) {
            return { ...base, ok: false, motivo: "anexo sem o campo viagens" };
        }

        const resumo = await this.viagensService.gravarLote(corpo.viagens, {
            origem: corpo.origem ?? null,
            transporte: "email",
            referencia: msg.messageId || anexo.filename || null,
        });

        return { ...base, ok: true, resumo, arquivo: anexo.filename };
    }
}

module.exports = EmailService;
