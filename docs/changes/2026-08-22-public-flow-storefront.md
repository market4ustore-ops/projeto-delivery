# Public Flow Boundary e Storefront mínimo

Implementados route handlers públicos server-side para iniciar e avançar FlowSession, rota `/r/[locationSlug]/[flowSlug]` e renderer mobile-first para TEXT, CHOICE, CATEGORY, PRODUCT_LIST, PRODUCT, UPSELL, CART, DELIVERY, CHECKOUT e END. START permanece automático.

Uma migration incremental adiciona slug público de Location, projeção pública mínima, TTL de 45 minutos e RPCs estreitas. O browser nunca acessa Supabase; `anon` continua sem SELECT. Token é localizado por hash, transições são conferidas contra a versão fixada e erros são sanitizados. Actions usam UUID idempotente e revisão.

Playwright cobre a jornada renderizada completa, Flow indisponível e sessão expirada. pgTAP cobre grants, anti-enumeração, primeiro node, token e TTL. Rate limiting distribuído foi documentado como dívida porque a infraestrutura atual não possui mecanismo compartilhado; não foi criado limiter in-memory enganoso.

Arquivos centrais: `apps/storefront/app/api/public`, `apps/storefront/app/r`, `supabase/migrations/20260822000400_public_flow_boundary.sql`, `supabase/tests/public_flow_boundary.test.sql`, `tests/e2e/public-flow.spec.ts`, `docs/domain/flows.md` e ADR-0009.
