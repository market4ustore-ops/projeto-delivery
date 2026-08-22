# Orders

Order Core transforma um Checkout `READY` em um registro operacional com fatos comerciais imutáveis. A conversão ocorre exclusivamente por `create_order_from_checkout`: bloqueia checkout e carrinho, revalida revisão e totais, reserva o número da unidade, copia snapshots e consome checkout/carrinho na mesma transação.

## Agregado e snapshots

`orders` pertence a uma unidade e referencia o checkout por chave estrangeira composta. Itens e modificadores preservam nomes, variante, preços, quantidade e total da linha; referências ao catálogo são opcionais para que remoções futuras não apaguem o histórico. Cliente, endereço, fulfillment e totais também são copiados no fechamento.

O número de exibição é sequencial por unidade, alocado por UPSERT atômico. A chave única `(location_id, display_number)` impede duplicidade. A unicidade de `checkout_id` torna retries da conversão idempotentes.

## Lifecycle

Entrega segue `CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`. Retirada segue `CONFIRMED → PREPARING → READY → DELIVERED`. Cancelamento é aceito antes de `DELIVERED`; estados terminais não avançam. Toda mudança usa revisão otimista e gera evento com ator, origem, destino, motivo e instante.

## Fronteiras

- Storefront cria e consulta somente com token opaco; a projeção pública omite IDs internos, cliente, endereço, revisão e timeline.
- Admin lista com `orders.read` e muda estado com `orders.update`, limitado à unidade acessível.
- Tabelas têm RLS default-deny; escrita operacional usa RPCs estreitas.

Payment, Kitchen, estoque, entregador, impressão, notificações e edição comercial após fechamento ficam fora desta fatia.
