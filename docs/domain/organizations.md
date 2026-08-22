# Organizations, Locations e Memberships

## Ownership

- `organizations` é a raiz do tenant.
- `locations.organization_id` expressa a relação de ownership organizacional.
- `organization_members` associa uma identidade do Supabase Auth a uma organization e a uma role.
- `location_members` concede alcance operacional a uma location sem duplicar `organization_id`, que é derivável por `locations`.

OWNER herda acesso a todas as locations da organization. CASHIER e KITCHEN precisam de `location_members` para acessar uma unidade. A role determina permissions; o vínculo determina alcance.

## Boundaries executáveis

- `create_organization(name)` cria Organization e membership OWNER na mesma transação PostgreSQL.
- `create_location(organizationId, name)` valida `location.update` contra `auth.uid()` antes do insert.
- `list_my_organizations()` e `list_my_locations(organizationId)` retornam apenas recursos visíveis pela identidade autenticada.

O argumento `organizationId` seleciona um contexto pretendido, mas nunca é tratado como prova de acesso. Helpers de RLS não aceitam `userId` fornecido pelo caller; usam sempre `auth.uid()`.

## Permissions

O catálogo inicial de permissions existe no domínio TypeScript e na policy SQL. Esta duplicação consciente permite autorização antes de acessar persistência e defesa no banco. Antes de permitir custom roles, deve-se escolher uma única fonte geradora para evitar divergência.

## Limites atuais

Não há convite, troca de role, remoção do último OWNER nem UI de gestão de membros neste incremento. Essas operações exigirão invariantes transacionais e testes próprios antes de serem expostas.
