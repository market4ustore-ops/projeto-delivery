# ADR-0006: Transações, eventos e outbox

**Status:** Proposed

## Contexto

Audit, analytics e realtime precisam observar fatos sem tornar o domínio dependente de transportes. Publicar depois do commit pode perder mensagens; antes do commit pode divulgar fatos revertidos.

## Decisão

Modelar eventos versionados e registrar eventos que exigem entrega junto à mudança de estado em outbox transacional. Começar com dispatcher simples; Supabase Realtime pode invalidar UI, mas banco permanece fonte de verdade. Audit crítico participa da unidade transacional quando aplicável.

## Alternativas consideradas

- Event bus externo agora: infraestrutura prematura.
- Publicação fire-and-forget após commit: janela de perda.
- Event sourcing: complexidade desnecessária para o slice.

## Consequências

Entrega recuperável e baixo acoplamento, ao custo de tabela/worker e idempotência dos consumidores quando a necessidade assíncrona entrar no slice.
