require("dotenv/config");
const path = require("node:path");
const fs = require("node:fs");

const arquivo = process.env.BANCO || path.resolve(__dirname, "database", "alerta-cx-carga.db");

// o better-sqlite3 cria o ARQUIVO do banco, mas nao a PASTA. Sem isso, toda
// instalacao nova quebra com "Cannot open database because the directory does
// not exist", porque database/ esta no .gitignore e nao vem junto no projeto.
fs.mkdirSync(path.dirname(path.resolve(__dirname, arquivo)), { recursive: true });

module.exports = {
    development: {
        client: "better-sqlite3",
        connection: { filename: arquivo },
        pool: {
            afterCreate: (conn, done) => {
                conn.pragma("journal_mode = WAL");
                conn.pragma("foreign_keys = ON");
                done();
            },
        },
        migrations: { directory: path.resolve(__dirname, "src", "database", "knex", "migrations") },
        useNullAsDefault: true,
    },
    production: {
        client: "better-sqlite3",
        connection: { filename: arquivo },
        pool: {
            afterCreate: (conn, done) => {
                conn.pragma("journal_mode = WAL");
                conn.pragma("foreign_keys = ON");
                done();
            },
        },
        migrations: { directory: path.resolve(__dirname, "src", "database", "knex", "migrations") },
        useNullAsDefault: true,
    },
};
