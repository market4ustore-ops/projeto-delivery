# Regras permanentes de engenharia

Este repositório implementa um SaaS multi-tenant de food service como monólito modular. Estas regras se aplicam a todo o repositório; arquivos `AGENTS.md` mais específicos podem apenas refiná-las sem violar as invariantes abaixo.

## Antes de alterar

- Leia `docs/architecture/overview.md`, os ADRs aceitos e a documentação do domínio afetado.
- Preserve configurações e alterações existentes. Não introduza uma ferramenta concorrente sem ADR.
- Faça mudanças pequenas, verticais e verificáveis. Não antecipe funcionalidades fora do slice atual.
- Decisões relevantes devem ser explícitas em ADR: contexto, decisão, alternativas e consequências.

## Fronteiras

- `packages/domain`: regras e tipos de negócio puros. Não pode importar Next.js, React, Supabase, PostgreSQL ou SDKs externos.
- `packages/application`: casos de uso, portas, autorização e transações. Depende do domínio, nunca de adapters concretos.
- `packages/database` e adapters de infraestrutura: implementam portas, persistência, auth, realtime e observabilidade.
- `apps/*`: composição e apresentação. Handlers validam entrada e chamam casos de uso; não contêm regra de negócio.
- Dependências apontam para dentro: presentation/infrastructure -> application -> domain. Comunicação entre módulos ocorre por API pública ou eventos, nunca por imports internos.
- Nenhum pacote de domínio conhece Supabase, Next.js, React Flow ou futuro provedor de pagamento.

## Multi-tenancy e segurança

- Toda entidade tenant-scoped deve possuir uma estratégia explícita de ownership. Dados organizacionais usam `organizationId`; dados operacionais de unidade usam `locationId`, sendo a organização derivável pela relação da unidade. Não duplicar `organizationId` e `locationId` em todas as tabelas sem necessidade, salvo quando houver justificativa de segurança, performance ou auditoria.
- Tenant e identidade vêm da sessão confiável no servidor, nunca de valores aceitos cegamente do cliente.
- Toda consulta tenant-scoped deve filtrar pelo tenant e o PostgreSQL deve reforçar o isolamento com RLS. Filtro de UI não é controle de segurança.
- Nunca exponha `service_role` ao navegador. Seu uso server-side exige justificativa, escopo mínimo e teste.
- Autorização usa permissions centralizadas, não condicionais de role espalhadas. Roles apenas concedem conjuntos de permissions.
- IDs opacos não substituem autorização. Logs não devem conter tokens, segredos ou dados pessoais desnecessários.

## Domínio e dados

- Dinheiro usa um tipo explícito no domínio e `NUMERIC/DECIMAL` no banco; nunca `float`/`number` para aritmética monetária sem uma representação inteira documentada.
- Estados de pedidos mudam somente pela state machine do domínio.
- Flow publicado é imutável. Edição cria/usa draft; sessões fixam `flowVersionId` até terminar.
- Flow referencia catálogo, mas não é autoridade de preço, estoque, pagamento ou permissão. Checkout recalcula dados autoritativos no backend.
- Alterações de schema são migrations versionadas. Não criar schema definitivo antes de aprovar o plano arquitetural.
- Efeitos externos ficam atrás de portas. Pagamentos permanecem apenas como boundary até entrarem no escopo.
- Operações que alteram múltiplas entidades que precisam permanecer consistentes devem executar dentro de uma única transação de banco. Nenhum workflow de aplicação deve simular atomicidade através de múltiplas chamadas independentes.
- Commands e endpoints suscetíveis a retry, duplicação de requisição ou webhook devem possuir estratégia explícita de idempotência. Criar pedidos, confirmar checkout, pagamentos e eventos externos nunca podem depender da suposição de que o cliente fará apenas uma requisição.
- Entidades que exigem rastreabilidade podem possuir estado atual para leitura eficiente, mas mudanças relevantes devem produzir histórico, audit log ou evento apropriado. Não reconstruir histórico exclusivamente a partir do estado atual.
- O Flow Engine é um motor determinístico de execução e não pode depender de React Flow, componentes visuais ou estado do editor. Dados persistidos do fluxo devem possuir schema/versionamento explícitos. Node types devem ser registrados por contrato e validados em runtime. Um node desconhecido ou configuração inválida deve falhar de forma segura e nunca executar parcialmente.
- Prefira a solução mais simples que preserve as invariantes do domínio. Abstrações devem proteger uma fronteira real, uma regra de negócio ou uma dependência externa. Não criar interfaces, factories, repositories ou layers apenas por padrão arquitetural.

## Type safety, erros e observabilidade

- TypeScript estrito; evite `any`, casts não comprovados e estados inválidos representáveis.
- Valide toda entrada de boundary com Zod; tipos internos não substituem validação em runtime.
- Use erros tipados e mapeie-os para respostas seguras na apresentação.
- Logs são estruturados e incluem correlation/request ID e IDs de tenant quando seguro.
- Eventos de domínio descrevem fatos no passado; publicação confiável deve compartilhar a transação via outbox quando houver consumidores assíncronos.
- Operações sensíveis geram audit log com ator, tenant, ação, alvo, resultado e timestamp, sem armazenar segredos.

## Testes e qualidade

- Regras de domínio: testes unitários. Casos de uso: testes com portas fake. Adapters/RLS: integração contra PostgreSQL/Supabase real local. Jornada: Playwright.
- Toda policy RLS deve ter teste negativo entre tenants, além do caso positivo.
- Bugs recebem teste de regressão. Testes não devem depender de ordem, relógio ou rede não controlados.
- Antes de concluir: execute lint, typecheck, testes afetados e build quando disponíveis; informe claramente o que não pôde ser executado.
- Não reduza segurança, tipagem ou cobertura para fazer uma verificação passar.

## Convenções de colaboração

- pnpm e Turborepo são as ferramentas padrão do monorepo.
- Exponha APIs públicas por módulo; não use imports profundos para contornar fronteiras.
- Commits e documentação não devem alegar funcionalidades ainda não implementadas.
- Toda implementação deve criar ou atualizar um registro em `docs/changes/` descrevendo objetivamente o que foi feito, como foi implementado, decisões tomadas, arquivos relevantes, validações executadas e limitações conhecidas. Use um arquivo por entrega, com nome `YYYY-MM-DD-descricao.md`; não registre apenas a intenção ou copie o relatório final sem contexto técnico.
- Não implementar IA, n8n, Mercado Pago, billing, motoboys, estoque avançado, pizzas complexas, A/B testing ou analytics dashboard sem mudança explícita de escopo.
