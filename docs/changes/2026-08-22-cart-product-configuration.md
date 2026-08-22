# 2026-08-22 — Cart + Product Configuration

## O que foi feito

Foi entregue a fatia vertical do carrinho público: domínio de precificação/configuração, casos de uso, contratos Zod, persistência PostgreSQL com RLS, RPCs públicas por token, integração no Storefront e testes automatizados.

## Como foi feito

- cálculos monetários usam unidades mínimas com `bigint` no domínio e `numeric(12,2)` no PostgreSQL;
- preços, disponibilidade, pertença e limites de modificadores são relidos no servidor;
- token aleatório é devolvido uma vez e persistido somente como hash;
- mutações usam lock, revisão otimista e tabela de respostas idempotentes;
- itens preservam snapshots de nome e preço;
- drawers responsivos permitem adicionar, editar, alterar quantidade e remover;
- pgTAP cobre privilégios, token inválido, isolamento entre locations, preço autoritativo, idempotência, conflito, obrigatoriedade e indisponibilidade.

## Decisões e trade-offs

Nenhum ADR novo foi necessário: token público restrito, RLS, `security definer`, Money e isolamento por `Location` aplicam decisões já aceitas. A expiração é deslizante por 24 horas após mutações; recuperação entre dispositivos não faz parte desta entrega.

## Arquivos principais

- `packages/domain/src/cart.ts`
- `packages/application/src/cart.ts`
- `supabase/migrations/20260822000600_cart.sql`
- `apps/storefront/app/api/public/cart/route.ts`
- `apps/storefront/app/r/[locationSlug]/[flowSlug]/public-flow.tsx`
- `supabase/tests/cart_rls.test.sql`

## Validação

Foram previstos `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rls`, `pnpm build` e `pnpm e2e`. O resultado final de cada comando é registrado no relatório da entrega e confirmado pela CI do GitHub.

## Fora de escopo

Checkout, Orders, Payments, Delivery, cupons, estoque, frete, analytics e recuperação persistente não foram implementados.
