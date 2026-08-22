# Flows

`Flow` é a identidade estável de uma jornada e pertence a uma `Location`. `FlowVersion` pertence ao Flow; nodes e edges derivam ownership, sem duplicar `location_id`. O slug é único por unidade e uma FK composta garante que `published_version_id` pertence ao próprio Flow.

Há no máximo um `DRAFT` por Flow. Somente ele aceita alterações; `PUBLISHED` e `ARCHIVED` são snapshots imutáveis. Criar Flow também cria v1 draft e audit. `ensure_flow_draft` devolve o draft ou clona a versão publicada com novos IDs. `publish_flow_version` valida, arquiva a publicada anterior, promove o draft, troca o ponteiro e audita numa transação.

Tipos: `START`, `TEXT`, `CHOICE`, `CATEGORY`, `PRODUCT_LIST`, `PRODUCT`, `UPSELL`, `CART`, `DELIVERY`, `CHECKOUT`, `END`. Configs são discriminadas e validadas nos boundaries Zod e domínio. Posição fica em metadata e não integra o engine. Edges suportam `ALWAYS` e `CHOICE_EQUALS`, sem expressões livres.

O validator usa códigos estáveis para START/END, config, edges, saídas, branches, alcançabilidade, ciclos e Catalog. A publicação confirma que Category/Product pertencem à mesma Location; Flow nunca é autoridade de preço ou disponibilidade. A V1 rejeita ciclos por segurança até existir semântica de execução limitada.

`flow.read`, `flow.write` e `flow.publish` protegem leitura, draft e publicação. RLS deriva Location pelos pais. O domínio expõe somente contratos iniciais do engine. React Flow, runtime, FlowSession, storefront, commerce, condições avançadas, edição em lote e analytics estão adiados. Audit é rastreabilidade, não analytics.
