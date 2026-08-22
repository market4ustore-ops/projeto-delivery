# ADR-0008: Dinheiro em minor units no domínio

**Status:** Accepted

## Contexto

Valores monetários não podem sofrer erros de ponto flutuante e o PostgreSQL deve continuar usando representação decimal exata.

## Decisão

Representar BRL no domínio como `bigint` em centavos (`minorUnits`) e converter explicitamente para/de string decimal nos boundaries. Persistir como `numeric(12,2)`. Preços são não negativos; `price_delta` de modifier pode ser negativo.

## Alternativas consideradas

- `number` decimal: rejeitado por imprecisão binária.
- Inteiro também no banco: seguro, mas menos natural para consultas financeiras SQL.
- Biblioteca monetária agora: dependência desnecessária para uma única moeda e operações simples.

## Consequências

Conversões ficam explícitas e testáveis. JSON não serializa `bigint`, então presentation usa string decimal ou minor units serializadas como string.
