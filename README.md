# API do Alerta de Caixa de Carga

Node + Express + SQLite (knex). Recebe as viagens do SGF, aplica as regras de
negocio e guarda o historico que alimenta a plataforma.

## Estrutura

```
src/
  server.js                 sobe o Express, registra rotas e o tratamento de erro
  configs/regras.js         PBT base, PBT max, volume meta, tamanho do lote
  routes/                   /api/v1/saude e /api/v1/viagens
  controllers/              recebe a requisicao e devolve a resposta
  services/                 regra de negocio (ViagensService, EmailService)
  repositories/             acesso ao banco, sem regra
  middlewares/              ensureApiKey
  jobs/leitorEmail.js       le a caixa por IMAP e entrega ao service
  database/knex/migrations/ schema versionado
  utils/                    AppError, normalizacao de fornecedor
```

## Subir

```bash
npm install
cp .env.example .env        # gere a API_KEY e preencha o IMAP
npm run migrate             # cria o banco
npm run dev                 # desenvolvimento (nodemon)
npm start                   # producao (pm2 via ecosystem.config.js)
```

## Endpoints

| Metodo | Rota | Autenticacao |
|---|---|---|
| GET | `/api/v1/saude` | nenhuma - alvo do teste de conectividade da planilha |
| POST | `/api/v1/viagens` | `X-API-Key` |
| GET | `/api/v1/viagens/fila` | `X-API-Key` |
| GET | `/api/v1/viagens/resumo` | `X-API-Key` |

## Leitor de e-mail

A rede da Veracel nao deixa a planilha fazer POST direto (testado em 23/09), entao
o transporte e por e-mail: a macro envia o lote como anexo .txt e o leitor busca.

Ele sobe junto com o servidor (`LEITOR_ATIVO=true`, agendado por `LEITOR_CRON`) ou
roda avulso com `npm run leitor:once`.

Duas barreiras antes de gravar: remetente em `REMETENTES_AUTORIZADOS` e `CODIGO_ENVIO`
no assunto. Recusada vai para a pasta de erros, processada vai para a de processados.
Em nenhum caso o leitor para.

No Gmail, `IMAP_SENHA` e uma **senha de aplicativo**, nao a senha da conta.

## Testes

```bash
npm run teste         # regras de gravacao, com 400 viagens reais
npm run teste:email   # leitura de e-mail, sem IMAP
```

## Regras implementadas

| Regra | Onde |
|---|---|
| Upsert por guia (idempotente) | `services/ViagensService.js` |
| Campo vazio nunca apaga valor gravado | idem - o UPDATE so leva o que veio preenchido |
| Foto, percentuais e resposta do analista nao sao sobrescritos | idem |
| Fila = volume < 62 m3 **e** PBT < 74.000 kg | `classificar()` |
| `desvio_identificado`: 0 automatico fora da regra, nulo aguardando o analista | idem |
| Fornecedor sem sufixo de estado | `utils/fornecedor.js` |
| Toda chamada registrada | tabela `recebimentos` |

## Proximas etapas

- autenticacao de usuarios (sessions, bcrypt, JWT) nos moldes das outras plataformas;
- migracao do frontend para consumir esta API.
