# Riscos e questões em aberto

## Riscos prioritários

1. **RLS com memberships complexas.** Recursão de policies, funções `security definer` mal protegidas e bypass por service role podem quebrar isolamento. Mitigação: desenho explícito, funções com `search_path` fixo, menor privilégio e suíte SQL negativa por tabela.
2. **Escopo de Location ambíguo.** Alguns dados podem ser da organization (produto) ou específicos da unidade (preço/disponibilidade). Mitigação: decidir ownership por aggregate antes do schema; não duplicar colunas por conveniência.
3. **Storefront público versus tenant.** É necessário resolver organization/location por slug/domínio sem permitir enumeração ou acesso a drafts. Mitigação: endpoint público restrito a versões publicadas e location ativa, com contrato separado.
4. **Concorrência de publicação.** Dois editores podem publicar drafts concorrentes ou sobrescrever mudanças. Mitigação: optimistic concurrency/version token e transação atômica.
5. **Sessões e versões.** Retenção/expiração não foi especificada; apagar versão quebra sessões. Mitigação: versões publicadas imutáveis e política de retenção antes de permitir exclusão.
6. **Preço no carrinho.** Requisitos mandam recalcular no checkout, mas o comportamento quando preço muda não está definido. Mitigação: snapshot informativo no cart, recálculo autoritativo ao criar order e resposta explícita de divergência.
7. **Realtime não garante workflow.** Eventos duplicados/perdidos ou UI desatualizada não podem comandar o estado. Mitigação: banco como fonte de verdade, refetch/reconexão idempotente e outbox quando necessário.
8. **Transição PREPARING concorrente.** Clientes simultâneos podem atualizar a mesma order. Mitigação: lock/compare-and-swap com versão e state machine novamente validada na transação.
9. **Monorepo fragmentado cedo.** Muitos packages podem aumentar ceremony e ciclos. Mitigação: um package por camada inicialmente, módulos internos e regras de import; separar só mediante evidência.
10. **Dados pessoais e auditoria.** Retenção, LGPD e anonimização ainda não foram definidos. Mitigação: minimização desde o início e ADR/política antes de armazenar dados de clientes em produção.

## Inconsistências ou decisões de produto pendentes

- “Autenticação” aparece depois de criar Organization/Location, mas criação tenant-scoped precisa de um ator. Proposta: signup/auth primeiro no fluxo técnico; onboarding autenticado cria organization, location e membership OWNER atomicamente.
- O role CASHIER não tem permissions e escopo de location fechados.
- Não está definido se catálogo é compartilhado entre locations, nem onde vivem preço e disponibilidade.
- Não está definido como storefront escolhe location, nem se checkout anônimo é permitido.
- Cart pode ser client-side, server-side ou persistido; isso afeta sessão, abandono e segurança.
- Criação de Order em `PENDING_PAYMENT` conflita com ausência de pagamentos no slice. Proposta para Sprint 1: pedido sem pagamento online nasce `CONFIRMED`; documentar o canal de pagamento futuro. Requer validação do produto.
- Semântica de cancelamento, transições a partir de cada estado e permissões para cancelar ainda precisam ser aceitas.
- Payload/configuração obrigatória por tipo de node e regras de grafos (ciclos, alcançabilidade, exatamente um START) precisam de especificação.
- Retenção de analytics/audit/flow sessions e limites de tamanho/complexidade do grafo não foram definidos.
