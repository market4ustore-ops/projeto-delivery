# Plano incremental do Sprint 1

Cada etapa deve terminar com teste e documentação, mantendo o sistema executável.

## 0. Aprovar fundação

Revisar ADRs, questões em aberto e modelo de tenancy. Critério: decisões bloqueadoras de catálogo, order inicial e storefront resolvidas. Nenhuma tabela definitiva antes desta aprovação.

## 1. Bootstrap do monorepo

Configurar pnpm, Turborepo, TypeScript estrito, lint/format, Vitest, Playwright, Tailwind/shadcn e os três apps mínimos. Adicionar regras automatizadas de fronteira e CI para install, lint, typecheck, unit/integration e build.

## 2. Primitives e tenancy

Implementar IDs, Money, erros, ActorContext, permissions e módulos Organization/Location/Membership. Criar primeiro conjunto de migrations/RLS somente após revisão. Entregar onboarding autenticado atômico: usuário -> organization -> location -> OWNER membership.

## 3. Catálogo mínimo

Implementar Category e Product, ownership acordado, repositories e CRUD mínimo no admin. Validar permission e tenant em application e RLS. Sem variants/modifiers avançados.

## 4. Flow authoring e publicação

Implementar grafo próprio, validação inicial, Flow/FlowVersion/draft e publicação imutável. Construir UI mínima com React Flow como adapter de edição. Testar publicação concorrente e fixação de versão.

## 5. Storefront e Flow Engine

Resolver location pública, iniciar FlowSession em versão publicada e percorrer nodes necessários ao slice. Renderers ficam na apresentação; transição fica no engine puro. Nodes fora do caminho mínimo podem ser explicitamente não suportados.

## 6. Cart e criação de Order

Adicionar produto referenciado ao cart. No backend, reler catálogo e disponibilidade, calcular valores autoritativos e criar Order/itens/evento/audit numa transação idempotente. Definir estado inicial antes desta etapa.

## 7. Kitchen

Listar orders da location em Kanban, receber sinal realtime como invalidação e permitir transição validada para `PREPARING`. A UI refaz consulta após reconnect e nunca altera estado local como fonte de verdade.

## 8. Hardening e aceite

Executar matriz multi-tenant, E2E completo, concorrência básica, revisão RLS, análise de bundle/segredos, logs/correlation e recovery de realtime. Publicar runbook local e seed determinístico de desenvolvimento.

## Definition of Done do slice

- Jornada completa funciona em ambiente limpo e CI.
- Nenhum acesso cruzado entre duas organizations/locations nos testes.
- Flow publicado permanece imutável e sessão antiga continua na versão fixada.
- Order usa valores recalculados no servidor e só muda por state machine.
- Kitchen exibe apenas sua location e transiciona validamente para PREPARING.
- Audit/eventos essenciais e erros estruturados são observáveis.
