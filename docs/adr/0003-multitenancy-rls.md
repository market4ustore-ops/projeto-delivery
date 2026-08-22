# ADR-0003: Isolamento multi-tenant com RLS

**Status:** Accepted

## Contexto

Filtros de frontend ou aplicação são insuficientes contra requests adulterados. Organization é tenant primário; Location é escopo operacional.

## Decisão

Toda entidade tenant-scoped possui ownership explícito. Dados organizacionais usam `organization_id`; dados operacionais usam `location_id`, derivando a organization pela unidade. Não duplicar ambos sem justificativa de segurança, performance ou auditoria. Resolver identidade por Supabase Auth e memberships; aplicar RLS default-deny e checagem de permission/escopo na aplicação. Usar service role somente em adapters server-side excepcionais e auditados.

## Alternativas consideradas

- Database por tenant: isolamento alto, custo operacional inadequado ao estágio.
- Schema por tenant: migrations e pooling complexos.
- Apenas filtros em repository: sujeitos a omissão e bypass.

## Consequências

Defesa em profundidade e modelo compartilhado escalável; joins de ownership precisam de índices e testes SQL positivos/negativos. `organization_members` concede papel organizacional; `location_members` restringe o alcance operacional de não-OWNER a unidades explícitas.
