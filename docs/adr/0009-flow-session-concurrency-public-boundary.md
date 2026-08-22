# ADR-0009: Concorrência e boundary público de FlowSession

**Status:** Accepted

## Contexto

Requests de avanço podem ser repetidas ou concorrentes. O Storefront futuro será anônimo, mas um token opaco isoladamente não constitui autorização suficiente para expor tabelas.

## Decisão

Cada sessão possui `revision`. O avanço persiste por compare-and-swap sob lock de linha: a revisão esperada deve coincidir e é incrementada uma vez. Uma chave de idempotência é única por sessão e conserva a resposta original para retries. A sessão guarda somente hash SHA-256 de um token aleatório de 256 bits; o token puro é entregue apenas na criação.

O navegador acessa somente route handlers Next.js. Eles validam DTOs, executam o engine no servidor e chamam RPCs `SECURITY DEFINER` mínimas usando a chave anon apenas no servidor. `anon` nunca recebe SELECT; as RPCs aceitam slug público ou token de alta entropia, validam versão/transição/expiração e não listam recursos. Erros são sanitizados.

## Alternativas

- Somente lock: evita concorrência, mas não torna retries idempotentes.
- Somente optimistic concurrency: detecta conflito, mas um retry após resposta perdida falha em vez de recuperar o resultado.
- RLS anônima baseada no token: exigiria transportar segredo de modo compatível com policies e ampliaria prematuramente a superfície pública.

## Consequências

Avanços são atômicos e reproduzíveis, com pequeno custo de ledger por comando. Será necessária política futura de retenção das chaves e um endpoint público server-side dedicado.
