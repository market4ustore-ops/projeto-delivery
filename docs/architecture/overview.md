# Visão arquitetural

## Objetivo

Construir um SaaS multi-tenant de food service como monólito modular, com isolamento forte de dados e um Flow Engine independente do editor React Flow. O primeiro incremento entrega uma jornada mínima ponta a ponta sem antecipar pagamentos ou integrações externas.

## Estrutura proposta

```text
apps/
  admin/                    # Next.js: gestão e Flow Builder
  storefront/               # Next.js: jornada pública
  kitchen/                  # Next.js: KDS/Kanban
packages/
  domain/                   # módulos de negócio puros
    organizations/
    catalog/
    flows/
    cart/
    orders/
    inventory/
    delivery/
    payments/               # somente contratos/conceitos futuros
    customers/
  application/              # casos de uso, portas, authz, UoW
  database/                 # adapters Supabase/Postgres, mappers
  ui/                       # componentes compartilhados, sem negócio
  schemas/                  # DTOs Zod de boundaries; não entidades
  events/                   # envelopes/contratos de integração
  shared/                   # primitives técnicas pequenas, não depósito genérico
  config/                   # configs compartilhadas TS/lint/Tailwind
supabase/
  migrations/
  functions/
  tests/
  seed.sql
docs/
  architecture/
  adr/
  domain/
```

Nesta fundação existem apenas os packages usados: `domain`, `application`, `database` e `schemas`. `ui`, `shared` e módulos futuros não foram criados vazios. Os três apps existem como composition roots; apenas Admin possui UI funcional neste incremento.

## Fluxo de dependências

```text
apps (presentation/composition) ---> application ---> domain
             |                           ^
             +---- database/adapters ----+

React Flow ---> tradução de grafo ---> Flow application API ---> Flow Engine
```

Infrastructure implementa interfaces definidas pelo lado consumidor em `application` (ou, quando estritamente de domínio, no próprio módulo). A raiz de composição de cada app liga implementações concretas aos casos de uso.

## Multi-tenancy

- `Organization` é a fronteira de assinatura e isolamento primário.
- `Location` pertence a exatamente uma organization e delimita operações locais.
- `organization_members` conecta usuário à organization e atribui role. `location_members` concede alcance operacional explícito a CASHIER/KITCHEN; OWNER herda todas as locations da organization.
- Permissões são calculadas centralmente a partir de memberships/roles e passadas como contexto confiável ao caso de uso.
- O banco aplica RLS usando o usuário autenticado e relações de membership. Casos de uso também exigem escopo de tenant: defesa em profundidade.
- Dados organizacionais carregam `organization_id`; dados operacionais carregam `location_id` e derivam organization pela relação. Duplicação dos dois exige justificativa.

## Flow Builder e Engine

- O editor usa React Flow apenas como UI e converte seu estado para um contrato de grafo próprio.
- `Flow` agrega identidade e ponteiros de versão; `FlowVersion` contém snapshot imutável do grafo publicado.
- O draft é mutável e separado do snapshot publicado. Publicar valida o grafo e cria/promove uma versão atômica.
- `FlowSession` fixa a versão no início. A próxima transição é calculada pelo engine puro a partir de estado, node e input.
- Nodes de catálogo guardam referências; preço e disponibilidade são consultados nas autoridades apropriadas.

## Autorização inicial

Permissions implementadas: `organization.read`, `organization.update`, `location.read`, `location.update`, `members.read`, `members.manage`, `catalog.read`, `catalog.write`, `orders.read`, `orders.update`, `flow.read`, `flow.write`, `flow.publish`, `inventory.read`, `inventory.write`, `analytics.read`.

Mapeamento inicial, centralizado e ajustável:

- `OWNER`: todas as permissions iniciais no escopo autorizado.
- `CASHIER`: leitura da organization/location, catálogo, pedidos, flow publicado e estoque; escrita de catálogo e atualização de pedidos nas locations atribuídas.
- `KITCHEN`: `orders.read` e `orders.update` somente em locations atribuídas.

## Transações e eventos

Criação de pedido, itens, transição inicial, audit e evento `ORDER_CREATED` formam uma única unidade transacional. Eventos internos síncronos podem começar em memória; qualquer entrega assíncrona/realtime confiável deve usar uma outbox transacional. Supabase Realtime é transporte, não fonte de verdade.

## Observabilidade mínima

Logger estruturado, correlation ID, mapeamento central de erros, audit log para ações sensíveis e envelope de evento com `eventId`, `type`, `occurredAt`, `organizationId`, `locationId`, `actorId`, `aggregateId`, `schemaVersion` e `correlationId`.
