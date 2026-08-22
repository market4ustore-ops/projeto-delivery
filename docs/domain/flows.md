# Flows

`Flow` é a identidade estável de uma jornada e pertence a uma `Location`. `FlowVersion` pertence ao Flow; nodes e edges derivam ownership, sem duplicar `location_id`. O slug é único por unidade e uma FK composta garante que `published_version_id` pertence ao próprio Flow.

Há no máximo um `DRAFT` por Flow. Somente ele aceita alterações; `PUBLISHED` e `ARCHIVED` são snapshots imutáveis. Criar Flow também cria v1 draft e audit. `ensure_flow_draft` devolve o draft ou clona a versão publicada com novos IDs. `publish_flow_version` valida, arquiva a publicada anterior, promove o draft, troca o ponteiro e audita numa transação.

Tipos: `START`, `TEXT`, `CHOICE`, `CATEGORY`, `PRODUCT_LIST`, `PRODUCT`, `UPSELL`, `CART`, `DELIVERY`, `CHECKOUT`, `END`. Configs são discriminadas e validadas nos boundaries Zod e domínio. Posição fica em metadata e não integra o engine. Edges suportam `ALWAYS` e `CHOICE_EQUALS`, sem expressões livres.

O validator usa códigos estáveis para START/END, config, edges, saídas, branches, alcançabilidade, ciclos e Catalog. A publicação confirma que Category/Product pertencem à mesma Location; Flow nunca é autoridade de preço ou disponibilidade. A V1 rejeita ciclos por segurança até existir semântica de execução limitada.

`flow.read`, `flow.write` e `flow.publish` protegem leitura, draft e publicação. RLS deriva Location pelos pais. O domínio expõe somente contratos iniciais do engine. React Flow, runtime, FlowSession, storefront, commerce, condições avançadas, edição em lote e analytics estão adiados. Audit é rastreabilidade, não analytics.

## Flow Runtime

`DeterministicFlowEngine` resolve exclusivamente `FlowDefinition`, input e `FlowExecutionContext`. START segue automaticamente uma única edge `ALWAYS`, com limite defensivo de oito transições. TEXT e nodes de Catalog aguardam `CONTINUE`; CHOICE aceita somente uma option declarada e escolhe exatamente uma edge `CHOICE_EQUALS`. CART, DELIVERY e CHECKOUT retornam boundaries sem executar commerce. END sinaliza conclusão.

O contexto contém IDs da Location/Flow/Version/Session, escolhas já feitas e um read model mínimo de Category/Product. A aplicação carrega esse modelo por `FlowCatalogReader`; preços e disponibilidade permanecem autoritativos no Catalog.

## FlowSession

Uma sessão fixa `flow_id`, `flow_version_id` e `location_id` no início. Estados: `ACTIVE`, `COMPLETED`, `ABANDONED` e `EXPIRED`; somente ACTIVE pode avançar para um terminal. Publicações posteriores não alteram sessões existentes.

Avanços usam `revision` esperada e lock de linha. Revisão divergente gera conflito e nenhuma escrita parcial. A chave de idempotência é única por sessão e guarda a resposta para que retries não avancem novamente. Eventos preservados: `FLOW_SESSION_STARTED`, `FLOW_NODE_ENTERED`, `FLOW_OPTION_SELECTED`, `FLOW_SESSION_COMPLETED` e `FLOW_SESSION_ABANDONED`.

O token público possui 256 bits aleatórios e somente seu hash é persistido. Ele não substitui autorização. Não há grants ou policies para `anon`; o Storefront futuro deverá usar endpoint server-side limitado a uma sessão, com rate limiting. Veja ADR-0009.

Continuam adiados Storefront final, Cart/Delivery/Checkout reais, Orders, pagamento, analytics e retenção automática de sessões/comandos.

## Public runtime boundary e Storefront

A URL pública é `/r/[locationSlug]/[flowSlug]`. O browser chama exclusivamente route handlers Next.js; não instancia Supabase nem consulta tabelas. Início e avanço validam input com Zod, executam o engine server-side e retornam somente token, revisão, status, conclusão e render payload. Textos são renderizados como texto React, sem HTML arbitrário.

As RPCs públicas usam slug ou hash do token, não aceitam tenant/user como autoridade, validam que o primeiro node é destino do START e que cada avanço corresponde à edge declarada da versão fixada. Erros públicos são reduzidos a `FLOW_NOT_AVAILABLE`, `SESSION_EXPIRED`, `SESSION_CHANGED` e `INVALID_ACTION`.

Sessões públicas expiram após 45 minutos de inatividade; avanço renova o TTL. O Storefront bloqueia submissão simultânea e gera UUID por ação, enquanto idempotência e revisão continuam reforçadas no banco. Sessão expirada oferece reinício.

A projeção pública de Catalog contém apenas nome, descrição, preço público, imagem e disponibilidade. Custos, memberships, audit e campos administrativos não são expostos. Rate limiting distribuído permanece um hook obrigatório do boundary de deploy; não foi simulado em memória nem foi adicionado Redis neste estágio.
