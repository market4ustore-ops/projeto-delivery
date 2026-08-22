# ADR-0005: Autorização por permissions

**Status:** Accepted

## Contexto

Condicionais por role espalhadas dificultam evolução e podem divergir entre apps.

## Decisão

Roles concedem conjuntos centralizados de permissions. OWNER recebe o conjunto completo; CASHIER e KITCHEN precisam de `location_members` para alcance operacional. Casos de uso declaram/exigem permission e escopo; presentation não decide autorização. RLS garante membership/tenant e alcance da unidade sem depender de payload do cliente.

## Alternativas consideradas

- Checks diretos de role: simples, rígidos e dispersos.
- ACL por recurso completa agora: flexível, complexa demais para roles iniciais.
- Autorização somente em RLS: mistura regras de produto e acesso a dados, com feedback pobre.

## Consequências

Política consistente e extensível; exige fechar grants de CASHIER/KITCHEN e testar application mais RLS.
