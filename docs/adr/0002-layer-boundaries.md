# ADR-0002: Dependências e ports/adapters

**Status:** Accepted

## Contexto

Supabase, Next.js, React Flow e futuro pagamento são detalhes substituíveis. Regras acopladas a SDKs seriam difíceis de testar e evoluir.

## Decisão

Dependências apontam presentation/infrastructure -> application -> domain. Application define portas requeridas; adapters concretos vivem em infrastructure/database. Apps são composition roots e não acessam persistência diretamente para executar negócio.

## Alternativas consideradas

- Active Record/SDK Supabase no domínio: menos código inicial, alto acoplamento e testes frágeis.
- Repository genérico compartilhado: reduz repetição aparente, mas apaga linguagem e necessidades de aggregates.
- Clean Architecture com muitas camadas por entidade: rejeitada como overengineering.

## Consequências

Domínio puro e testável, com mappers e wiring adicionais. Regras de import e APIs públicas precisam ser automatizadas.
