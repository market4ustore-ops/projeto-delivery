# Flow Builder visual

## O que foi feito

O editor textual do Admin foi substituído por um Flow Builder desktop-first com biblioteca de etapas, canvas React Flow, componentes visuais próprios, configuração contextual, validação, feedback de salvamento, prévia privada e publicação. O vocabulário da interface fala em jornadas, etapas, opções e próximos passos.

## Como foi implementado

React Flow existe somente em `apps/admin`. `flow-editor-adapter.ts` converte linhas persistidas em nodes/edges de apresentação e aplica layout automático simples; posições manuais ficam em `editor_metadata` e não alteram o engine. Os configs continuam usando os schemas existentes. Perguntas traduzem opções para `CHOICE_EQUALS` sem expor esse termo na UI.

START é criado automaticamente. Autosave usa debounce de 700 ms e compare-and-swap por `updated_at`; conflito não sobrescreve silenciosamente. A nova RPC de branches substitui todas as saídas da etapa numa transação, validando draft, permission, opção e pertença à mesma versão. Draft, validação e publicação reutilizam `ensure_flow_draft`, `validate_flow_version` e `publish_flow_version`.

O Catalog da Location atual alimenta os seletores sem copiar nome ou preço para o Flow. A prévia de rascunho permanece privada no Admin e apresenta a etapa selecionada; o teste vertical publica e executa a definição no Storefront real, que continua sendo a prova autoritativa do runtime.

## Arquivos principais

- `apps/admin/app/ui/flow-panel.tsx`
- `apps/admin/app/ui/flow-editor-adapter.ts`
- `apps/admin/app/styles.css`
- `supabase/migrations/20260822000500_flow_builder.sql`
- `supabase/tests/flow_builder.test.sql`
- `tests/e2e/flow-builder.spec.ts`

## Validações e limitações

O adapter possui testes de conversão, layout, metadata e branches. pgTAP cobre START automático, concorrência e isolamento cross-tenant. Playwright cria dados reais, monta branches, valida, publica e percorre a rota pública com Supabase local na CI.

O renderer completo ainda não foi extraído para compartilhamento entre os dois apps; a prévia privada é deliberadamente visual e a execução integral acontece após publicação. Remoção de etapas, undo/redo, atalhos e colaboração em tempo real ficaram adiados. Cart, Orders e demais itens fora do escopo não foram implementados.
