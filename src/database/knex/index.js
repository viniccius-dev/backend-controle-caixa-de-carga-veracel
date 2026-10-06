const config = require("../../../knexfile");
const knex = require("knex");

const ambiente = process.env.NODE_ENV === "production" ? "production" : "development";
const connection = knex(config[ambiente]);

module.exports = connection;
