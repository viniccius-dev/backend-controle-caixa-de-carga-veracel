exports.up = (knex) =>
    knex.schema.createTable("viagens", (t) => {
        t.string("guia").primary();

        // identificacao
        t.string("serie");
        t.integer("numero_documento");
        t.string("fornecedor");
        t.string("fornecedor_norm").index();
        t.string("placa");
        t.string("rmt");
        t.string("tipo_conjunto");

        // viagem
        t.string("data_inicio_viagem").index();
        t.string("projeto");
        t.string("talhao");
        t.string("local_carregamento");
        t.string("uo");
        t.float("distancia");
        t.integer("situacao");

        // preenchidos ao longo do ciclo, em envios posteriores
        t.string("grua").index();
        t.string("data_chegada_balanca").index();
        t.float("pbt");
        t.float("volume");
        t.float("pbt_base").notNullable().defaultTo(74000);

        // preenchidos pelo analista
        t.text("foto");
        t.float("comp1");
        t.float("comp2");
        t.float("comp3");
        t.text("observacao");

        // controle
        t.string("classificacao").notNullable().defaultTo("em_transito"); // em_transito | sem_desvio | com_desvio
        t.boolean("desvio_identificado");                                 // null = pendente do analista
        t.string("tratamento").notNullable().defaultTo("pendente");       // pendente | tratada | enviada
        t.string("criado_em").notNullable();
        t.string("atualizado_em").notNullable();

        t.index(["classificacao", "desvio_identificado"], "ix_viagens_fila");
    });

exports.down = (knex) => knex.schema.dropTableIfExists("viagens");
