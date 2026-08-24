# Kitchen

Kitchen é uma projeção operacional de Orders, não um domínio separado. A autoridade de estado, revisão e transições continua no agregado Order.

## Projeção e autorização

`KitchenOrder` contém apenas identidade técnica para comando, número de exibição, estado, revisão, confirmação/agendamento, fulfillment e snapshots dos itens, variantes e modificadores. Telefone, endereço, cliente, preços, pagamento e totais não atravessam essa fronteira.

O board exige sessão autenticada, unidade explícita e as permissions existentes `orders.read` e `orders.update`. Usuários operacionais continuam limitados por `location_members`; UUID conhecido não concede acesso.

## Estados e ações

- Novos: `CONFIRMED`, ação “Iniciar preparo”.
- Em preparo: `PREPARING`, ação “Marcar como pronto”.
- Prontos: `READY`, sem ação nesta fatia.

A RPC específica da UI delega para a mesma atualização versionada de Order. Conflitos de revisão geram `ORDER_REVISION_CONFLICT`, causam refetch e não sobrescrevem outro dispositivo.

## Realtime, offline e recuperação

Realtime transmite somente um sinal mínimo filtrado por `location_id`; o cliente sempre refaz a leitura autoritativa. Trocar a unidade remove a subscription anterior e limpa imediatamente o board. Falhas são recuperadas por foco, evento `online`, atualização manual e fallback de 60 segundos. Sem conexão, ações ficam desabilitadas.

O tempo decorrido é calculado localmente a partir de `confirmedAt`. O destaque “⚠” usa temporariamente 20 minutos como configuração de apresentação, não SLA de domínio.
