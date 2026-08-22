# Order Core — 2026-08-22

## O que foi feito

Foi adicionada a conversão transacional e idempotente de Checkout pronto em Order, com snapshots comerciais, numeração por unidade, lifecycle versionado, histórico, RLS e projeções separadas para Admin e Storefront. O Admin ganhou leitura e ação mínima de iniciar preparo; o Storefront ganhou confirmação e acompanhamento público.

## Como foi feito

- O domínio define estados, transições de entrega/retirada, terminais e revisão otimista.
- A migration cria agregado, constraints, índices, policies e RPCs; bloqueios de linha e contador atômico protegem concorrência.
- A aplicação autoriza comandos e recusa referências de outra unidade.
- Schemas Zod validam entrada pública e resposta administrativa.
- Testes unitários e pgTAP cobrem isolamento, snapshots, idempotência e lifecycle no PostgreSQL real.

## Limites deliberados

Não foram implementados Payment, Kitchen UI, estoque, logística, impressão, notificações ou edição de itens após confirmação.
