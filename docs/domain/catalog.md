# Catalog

## Entidades e ownership

Catalog pertence operacionalmente a `Location`. `Category` e `Product` carregam `location_id`; a Organization é derivada por `locations`. `ProductVariant` e `ModifierGroup` derivam a unidade pelo Product, e `ModifierOption` pelo grupo e Product.

Relações: Location → Categories → Products → Variants / Modifier Groups → Modifier Options. A foreign key composta `(location_id, category_id)` impede estruturalmente que Product referencie Category de outra unidade.

## Invariantes

- Nomes têm 2–120 caracteres; slugs normalizados são únicos por Location.
- `base_price`, preço final da Variant e demais preços absolutos são não negativos.
- `is_active` controla participação administrativa/futura publicação; `is_available` representa disponibilidade operacional e não estoque.
- Existe no máximo uma Variant simultaneamente ativa e default por Product, garantido por índice parcial.
- `min_selections >= 0`, `max_selections >= min_selections` e `is_required = (min_selections > 0)`.
- Coerência entre máximo e quantidade de opções é validada pelo domínio quando a quantidade é conhecida; mudanças futuras em lote exigirão boundary transacional.

## Money

O domínio usa `bigint` em centavos BRL. Boundaries convertem string decimal ↔ minor units; PostgreSQL usa `numeric(12,2)`. `ProductVariant.price` é preço final, não delta. `ModifierOption.price_delta` pode ser positivo, zero ou negativo. Veja ADR-0008.

## Permissions e RLS

`catalog.read` permite leitura administrativa apenas em Locations acessíveis; `catalog.write` protege insert/update. As policies reutilizam `can_access_location` e `has_permission`. Não há acesso público/anônimo às tabelas.

## Decisões adiadas

Publicação pública, upload de imagens, exclusão, estoque, promoções, pizzas multi-sabor, remoção de ingredientes e atualização atômica de grupos/opções em lote permanecem fora do escopo.
