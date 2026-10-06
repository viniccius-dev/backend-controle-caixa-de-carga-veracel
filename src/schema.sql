-- Banco do Alerta de Caixa de Carga.
-- Uma linha por viagem. A chave e a guia (serie + "-" + numero), que ja e o
-- identificador usado no alerta e no sistema.

CREATE TABLE IF NOT EXISTS viagens (
  guia                  TEXT PRIMARY KEY,

  -- identificacao
  serie                 TEXT,
  numero_documento      INTEGER,
  fornecedor            TEXT,            -- como veio do SGF
  fornecedor_norm       TEXT,            -- sem sufixo de estado, para agrupar
  placa                 TEXT,
  rmt                   TEXT,
  tipo_conjunto         TEXT,

  -- viagem
  data_inicio_viagem    TEXT,
  projeto               TEXT,
  talhao                TEXT,
  local_carregamento    TEXT,
  uo                    TEXT,
  distancia             REAL,
  situacao              INTEGER,

  -- preenchidos depois, ao longo do ciclo
  grua                  TEXT,
  data_chegada_balanca  TEXT,
  pbt                   REAL,            -- kg
  volume                REAL,            -- m3
  pbt_base              REAL NOT NULL DEFAULT 74000,

  -- preenchidos pelo analista na plataforma
  foto                  TEXT,
  comp1                 REAL,
  comp2                 REAL,
  comp3                 REAL,
  observacao            TEXT,

  -- controle
  classificacao         TEXT NOT NULL DEFAULT 'em_transito',  -- em_transito | sem_desvio | com_desvio
  tratamento            TEXT NOT NULL DEFAULT 'pendente',     -- pendente | tratada | enviada
  criado_em             TEXT NOT NULL,
  atualizado_em         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_viagens_chegada     ON viagens(data_chegada_balanca);
CREATE INDEX IF NOT EXISTS ix_viagens_inicio      ON viagens(data_inicio_viagem);
CREATE INDEX IF NOT EXISTS ix_viagens_class       ON viagens(classificacao);
CREATE INDEX IF NOT EXISTS ix_viagens_fornecedor  ON viagens(fornecedor_norm);
CREATE INDEX IF NOT EXISTS ix_viagens_grua        ON viagens(grua);

-- Toda chamada recebida fica registrada, para auditoria e para diagnosticar
-- envio que nao chegou.
CREATE TABLE IF NOT EXISTS recebimentos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recebido_em   TEXT NOT NULL,
  origem        TEXT,
  transporte    TEXT,          -- http | email
  referencia    TEXT,          -- id da mensagem de e-mail, quando houver
  recebidas     INTEGER NOT NULL DEFAULT 0,
  criadas       INTEGER NOT NULL DEFAULT 0,
  atualizadas   INTEGER NOT NULL DEFAULT 0,
  sem_mudanca   INTEGER NOT NULL DEFAULT 0,
  rejeitadas    INTEGER NOT NULL DEFAULT 0,
  detalhe       TEXT
);
