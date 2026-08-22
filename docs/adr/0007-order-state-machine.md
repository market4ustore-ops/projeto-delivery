# ADR-0007: Estado e concorrência de pedidos

**Status:** Proposed

## Contexto

Pedidos não podem saltar arbitrariamente entre estados, e kitchen/admin podem agir concorrentemente.

## Decisão

Centralizar transições numa state machine de domínio. O caso de uso autoriza, recarrega e aplica a transição dentro de transação com optimistic concurrency (versão/compare-and-swap), gravando evento e audit. O banco reforça valores válidos, mas não replica toda a state machine em triggers inicialmente.

## Alternativas consideradas

- Updates livres pela UI/repository: permitem estados inválidos.
- State machine somente em trigger: difícil de testar e acopla regra ao banco.
- Lock pessimista em toda leitura: contenção desnecessária no início.

## Consequências

Invariantes testáveis e conflitos detectáveis; clientes precisam tratar conflito/recarregar. A matriz final de transições e o estado inicial sem pagamento aguardam decisão de produto.
