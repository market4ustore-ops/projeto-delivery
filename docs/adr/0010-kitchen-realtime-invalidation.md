# ADR-0010: Realtime de Kitchen por invalidação mínima

**Status:** Proposed

## Contexto

`orders` contém telefone, endereço e valores financeiros que não são necessários para produção. Assinar diretamente essa tabela transmitiria dados excessivos, mesmo quando RLS restringisse corretamente a unidade.

## Decisão

Publicar no Supabase Realtime somente `kitchen_order_signals`, contendo `order_id`, `location_id`, `revision` e instante da mudança. A subscription é filtrada por unidade e funciona apenas como invalidação; ao receber um sinal, Kitchen refaz `list_kitchen_orders`, cuja autorização e projeção mínima são aplicadas no servidor.

## Alternativas

- Assinar `orders`: rejeitada por data minimization.
- Polling como mecanismo principal: rejeitado pela latência e carga desnecessária.
- Outbox/worker dedicado: confiável, mas prematuro para invalidação de UI sem consumidor assíncrono.

## Consequências

Realtime não é fonte de verdade e perder um evento não compromete consistência: foco, reconexão, atualização manual e fallback de 60 segundos recuperam o estado. Existe uma pequena tabela técnica adicional, protegida por RLS e sem dados pessoais.
