# Checkout

Checkout pertence ao mesmo `Cart` e à mesma `Location`, reforçados por foreign key composta. Existe no máximo uma sessão por Cart. A boundary pública reutiliza o token opaco do Cart; o banco continua armazenando somente seu hash e `anon` não recebe acesso direto às tabelas.

## Lifecycle e concorrência

Estados funcionais: `IN_PROGRESS`, `READY`, `EXPIRED` e `CANCELED`. `COMPLETED` não existe ainda porque dependerá da conversão idempotente em Order. Toda mutação recebe `expectedRevision`; retries usam um ledger por `idempotencyKey`.

READY significa que identificação, fulfillment e endereço aplicável foram validados, e que o catálogo e o Cart foram recalculados na mesma transação. `cart_revision_validated` registra a revisão comprovada. Um trigger invalida imediatamente READY quando a revisão do Cart muda.

## Fulfillment e cliente

São suportados `DELIVERY` e `PICKUP`. Nome e telefone não criam CRM nem exigem login. Delivery exige CEP, rua, número, bairro, cidade e UF; complemento e referência são opcionais. Pickup não exige endereço do cliente.

A taxa de entrega é uma configuração server-side mínima da Location. A função de preparação lê essa configuração; o browser não envia taxa ou totais. Geocoding, distância, zonas e agenda ficam adiados. `scheduled_for` foi reservado no schema, mas apenas atendimento imediato é anunciado como funcional.

## Revalidação financeira

Antes de READY, o banco trava Checkout e Cart, relê Product, Variant e ModifierOption, confirma ownership/disponibilidade, recalcula preços e subtotal e calcula taxa/total. Snapshots do Cart são somente valores exibidos para comparação. Mudança de preço retorna `PRICE_CHANGED` com nome e valores antigos/novos seguros, mantém o Checkout em progresso e exige correção/revisão explícita. Indisponibilidade retorna códigos tipados e nunca produz READY.

## Futuro Order

A futura conversão deve exigir `status=READY`, Cart ainda ACTIVE e `cart_revision_validated=cart.revision`, além de idempotência própria. Esta entrega para deliberadamente antes de criar Order, pagamento ou Kitchen.
