# Estratégia de testes

## Pirâmide

- **Unitários (Vitest):** value objects, permission policy, validação/execução de grafo, versionamento e Order State Machine.
- **Application (Vitest + fakes):** casos de uso, escopo de ator, idempotência, rollback e emissão de eventos/audit.
- **Integração:** repositories, migrations, constraints, transações e Supabase Auth/RLS contra stack local real.
- **E2E (Playwright):** browsers por persona nos três apps.

Mocks de repository não provam RLS. Testes de isolamento devem executar com JWTs/roles equivalentes aos de produção, nunca apenas como postgres/service role.

## Matriz obrigatória de isolamento

Para cada tabela tenant-scoped e operação `select/insert/update/delete` relevante:

1. Membro autorizado de Org A acessa dado de A.
2. O mesmo usuário não lê nem altera dado de Org B mesmo conhecendo o UUID.
3. Usuário sem membership é negado.
4. Membership de location A1 não concede location A2 quando o recurso é location-scoped.
5. Role autenticada não forja `organization_id`/`location_id` no insert.
6. Mudança de payload, query string, header ou route param não troca o tenant confiável.
7. OWNER/CASHIER/KITCHEN respeitam permissions e escopos centralizados.
8. Endpoint público só lê location ativa e FlowVersion publicada; draft e dados administrativos são invisíveis.

As fixtures criam duas organizations, ao menos duas locations em uma delas, usuários exclusivos e um usuário multi-membership para detectar confusão de contexto.

## Provas do vertical slice

E2E principal:

1. Usuário autentica e conclui onboarding de organization/location.
2. OWNER cria category e product.
3. OWNER cria draft, adiciona nodes válidos e publica V1.
4. Cliente inicia sessão no storefront e ela fixa V1.
5. OWNER publica V2; sessão existente continua em V1 e nova sessão usa V2.
6. Cliente percorre flow, adiciona produto ao cart e cria order.
7. Teste adultera preço no request; total persistido continua sendo o recalculado pelo servidor.
8. Kitchen da mesma location recebe/encontra a order e muda `CONFIRMED -> PREPARING`.
9. Kitchen de outra organization e, conforme política, outra location não encontra nem altera a order.

## Casos negativos e concorrência

- Grafo sem START, com referência inexistente ou node inalcançável não publica.
- Versão publicada não aceita update/delete destrutivo.
- Duas publicações com o mesmo token: somente uma vence.
- Transições inválidas (por exemplo `DELIVERED -> PREPARING`) falham sem alteração/evento.
- Dois comandos de criação com mesma idempotency key criam uma order.
- Falha ao gravar item/evento/audit reverte a criação transacional.
- Realtime duplicado ou reconexão não duplica cards nem transições.
- Token ausente/expirado, input Zod inválido e referência cross-tenant retornam erro seguro sem vazamento de existência.

## CI

Jobs separados: lint/typecheck; unit; build; Supabase local + migrations + testes RLS/integration; Playwright. Migrations devem ser aplicadas do zero e, quando houver baseline, testadas em upgrade. Falha de teste negativo de RLS bloqueia merge.
