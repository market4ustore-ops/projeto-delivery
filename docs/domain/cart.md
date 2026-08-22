# Cart e configuração de produto

O carrinho público pertence a uma `Location` e é acessado somente por um token opaco de 256 bits. O banco guarda apenas o SHA-256 desse token. `Cart`, `CartItem`, modificadores e comandos idempotentes não concedem `SELECT`, `INSERT`, `UPDATE` ou `DELETE` a `anon`; toda operação pública passa por RPCs estreitas `security definer`.

## Regras

- estados: `ACTIVE`, `CONVERTED`, `ABANDONED` e `EXPIRED`;
- apenas um carrinho `ACTIVE` e não expirado aceita mutações;
- quantidade inteira entre 1 e 99;
- produto, variante, grupos e opções devem pertencer ao mesmo produto e à mesma `Location`;
- produto, variante e opção precisam estar disponíveis;
- mínimos e máximos de cada grupo são validados no servidor;
- preço unitário = preço da variante selecionada (ou preço base) + modificadores;
- subtotal = soma dos totais de linha, usando valores monetários exatos;
- nomes e preços são copiados para snapshots do item;
- cada mutação recebe `expectedRevision` e falha com `CART_REVISION_CONFLICT` quando obsoleta;
- a mesma `idempotencyKey` devolve a resposta original, sem aplicar nem incrementar novamente.

## Fronteiras

O Storefront cria o carrinho ao iniciar a jornada e usa o mesmo mecanismo para nós `PRODUCT`, `PRODUCT_LIST` e `UPSELL`. O nó `CART` abre a visualização persistente. Delivery, checkout, pedido, pagamento, cupom, estoque, frete e recuperação persistente do carrinho permanecem fora desta fatia.

O navegador nunca determina o preço final: ele envia somente identificadores e quantidade. A RPC trava o carrinho, relê o catálogo autoritativo, valida a configuração, recalcula e persiste em uma única transação.
