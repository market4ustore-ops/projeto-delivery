# Fundação executável e núcleo multi-tenant

**Data:** 2026-08-22  
**Escopo:** bootstrap do monorepo, autenticação preparada e tenancy inicial.

## O que foi feito

- Criado monorepo pnpm/Turborepo com TypeScript strict, ESLint, Prettier e Vitest.
- Criados os apps Next.js `admin`, `storefront` e `kitchen`; apenas Admin recebeu UI funcional neste incremento.
- Criados os packages efetivamente utilizados: `domain`, `application`, `database` e `schemas`.
- Implementados Organization, Location, Organization Membership, Location Membership, roles e permissions.
- Configurado Supabase local com migration versionada, RLS, RPCs e testes pgTAP.
- Criado pipeline CI para lint, typecheck, testes, build e testes RLS.

## Como foi implementado

O domínio foi mantido como TypeScript puro. Roles são traduzidas para conjuntos centralizados de permissions; os casos de uso autorizam operações por permission e recebem tenant por um `ActorContext` confiável.

No banco, `organizations` é a raiz do tenant. `locations` carrega `organization_id`; `location_members` guarda apenas `location_id`, pois a organização é derivável pela relação da unidade. OWNER herda acesso às unidades da organização, enquanto CASHIER e KITCHEN dependem de vínculo operacional explícito.

As operações expostas pela UI usam RPCs pequenas. `create_organization` cria a organização e o primeiro membership OWNER na mesma transação PostgreSQL. Helpers RLS usam sempre `auth.uid()` e não aceitam um `user_id` fornecido pelo cliente. Respostas do SDK Supabase são validadas com Zod antes de entrarem no estado da interface.

## Decisões relevantes

- Não foram criados packages ou módulos futuros vazios.
- O browser utiliza somente URL e anon key; `service_role` não participa de operações normais.
- Permissions existem no domínio TypeScript e no SQL para defesa em profundidade. Uma fonte geradora única foi adiada até existir necessidade de roles customizadas.
- Playwright não foi adicionado porque ainda não existe uma jornada E2E completa.

## Arquivos principais

- `AGENTS.md`
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- `apps/admin/app/ui/admin-foundation.tsx`
- `packages/domain/src/permissions.ts`
- `packages/application/src/index.ts`
- `packages/schemas/src/index.ts`
- `supabase/migrations/20260821000100_tenancy_core.sql`
- `supabase/tests/tenancy_rls.test.sql`
- `.github/workflows/ci.yml`

## Validações

- `pnpm install`: concluído.
- `pnpm lint`: aprovado nos sete projetos.
- `pnpm typecheck`: aprovado nos sete projetos.
- `pnpm test`: cinco testes Vitest aprovados.
- `pnpm build`: três apps e quatro packages aprovados.
- `pnpm format:check`: aprovado.
- Varredura de secrets: nenhum segredo encontrado.
- `pnpm test:rls`: não executado localmente porque não havia PostgreSQL/Supabase local ativo; a máquina não possuía Docker disponível. O job RLS foi preparado na CI.

### Validação na CI

A primeira execução real no GitHub Actions aplicou a migration corretamente e executou os 15 testes. Treze passaram; os testes de criação autorizada de Location falharam porque `INSERT ... RETURNING` também exigia visibilidade da nova linha pela policy de leitura no mesmo statement. A RPC foi corrigida para gerar o UUID antes do insert e retornar a variável separadamente, preservando a policy de criação e evitando acoplar o comando à policy de leitura.

A execução seguinte, referente ao commit `e5fdf07`, concluiu os jobs `quality` e `rls` com sucesso. O resumo pgTAP confirmou `Files=1, Tests=15`, `All tests successful` e `Result: PASS`. Evidência: [GitHub Actions run 32574903791](https://github.com/market4ustore-ops/projeto-delivery/actions/runs/32574903791).

## Limitações e débitos adiados

- A execução local continua dependente de Docker, mas migration e testes pgTAP foram comprovados contra a stack Supabase real no GitHub Actions.
- Convites, mudança de roles, remoção do último OWNER e gestão de memberships não pertenciam ao escopo.
- Node 20 ainda executa o projeto, mas o SDK Supabase recomenda migração para Node 22.
- Catalog, Flow, Cart, Orders e operações de Kitchen não foram iniciados.
