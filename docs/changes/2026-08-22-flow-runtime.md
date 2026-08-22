# Flow Runtime e FlowSession

Implementado o engine determinístico em memória para todos os node types iniciais, com transições declarativas, START automático limitado, CHOICE tipado, read model mínimo de Catalog e boundaries de commerce. FlowSession fixa a versão publicada e usa lifecycle terminal explícito.

A aplicação recebeu `StartFlowSession`, `GetFlowSession`, `AdvanceFlowSession` e `AbandonFlowSession`, com portas específicas. Concorrência usa revisão esperada; retries usam chave idempotente. A migration incremental cria sessões, ledger de comandos e eventos, guarda apenas hash do token público e mantém `anon` sem acesso direto.

Arquivos principais: `packages/domain/src/flow-runtime.ts`, `packages/application/src/flow-runtime.ts`, `supabase/migrations/20260822000300_flow_runtime.sql`, `supabase/tests/flow_runtime_rls.test.sql`, `docs/domain/flows.md` e ADR-0009. React Flow, Storefront final e módulos reais de commerce não foram implementados.
