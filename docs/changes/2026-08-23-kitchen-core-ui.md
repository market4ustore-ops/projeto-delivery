# Kitchen Core + Kitchen UI — 2026-08-23

## O que foi feito

Implementada a aplicação operacional independente `apps/kitchen`, com autenticação, seleção de unidade, board Novos/Em preparo/Prontos, detalhe de produção e comandos `CONFIRMED → PREPARING → READY`. O runtime do projeto foi fixado em Node 22.

## Como foi implementado

- RPCs retornam um read model mínimo e reutilizam a atualização concorrente de Order.
- Uma tabela-sinal RLS transmite apenas invalidação Realtime por unidade; toda mudança causa refetch autoritativo.
- A UI possui loading por skeleton, estados vazio/offline/erro, reconexão, foco, fallback de 60 segundos, preferência local de som, navegação por teclado e touch targets amplos.
- pgTAP cobre permissions, isolamento, payload mínimo, Realtime, mutação cross-location e conflito de revisão.
- Playwright percorre Storefront, confirma o pedido, opera Kitchen, verifica status público e reload.

## Arquivos principais

- `apps/kitchen/app/ui/kitchen-app.tsx`
- `apps/kitchen/app/kitchen-board.ts`
- `supabase/migrations/20260823000900_kitchen.sql`
- `supabase/tests/kitchen_rls.test.sql`
- `docs/adr/0010-kitchen-realtime-invalidation.md`

## Limitações

O threshold visual de atraso é local e temporário. Não há edição de pedido, pagamentos, estoque, expedição, entrega ou preferências sincronizadas.
