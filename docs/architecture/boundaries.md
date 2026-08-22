# Fronteiras arquiteturais

## Domain

Contém entidades, value objects, invariantes, policies puras, state machines e eventos de domínio. Não conhece transporte, persistência, framework, sessão HTTP ou SDK externo. Exemplos: validação estrutural de um flow, publicação/versionamento e transições válidas de Order.

## Application

Orquestra casos de uso e transações. Define portas para repositórios, relógio, IDs, autorização, unidade de trabalho, eventos e auditoria. Recebe um `ActorContext` confiável, carrega aggregates, invoca regras do domínio e persiste resultados. Não contém SQL nem importa adapters Supabase.

Casos de uso são organizados por módulo, não por tecnologia: `catalog/create-product`, `flows/publish-flow`, `orders/change-order-status`.

## Infrastructure / database

Implementa portas: repositories PostgreSQL, Supabase Auth identity adapter, transaction manager, outbox, logger e realtime publisher. Faz mapeamento explícito entre rows e tipos de domínio. RLS, migrations, constraints e índices vivem aqui e reforçam invariantes que podem sofrer concorrência.

O pacote `database` não vira uma API de negócio paralela: apps não consultam tabelas diretamente para contornar casos de uso.

## Presentation

Vive em `apps/*`: pages/components, route handlers, server actions e presenters. Valida DTOs com Zod, obtém identidade da sessão server-side, chama um caso de uso e traduz resultado/erro para HTTP/UI. Componentes de UI não decidem autorização nem transições de estado.

## APIs entre módulos

- Cada módulo expõe um barrel/API público pequeno.
- Um módulo não acessa tabelas ou arquivos internos de outro módulo.
- Regras que precisam de dados de outro módulo usam uma query port ou serviço de aplicação explicitamente nomeado.
- Eventos reduzem acoplamento para efeitos secundários; operações que exigem resposta imediata usam chamadas explícitas.
- `shared` aceita apenas primitives técnicas estáveis. Conceitos de negócio permanecem no módulo proprietário.
