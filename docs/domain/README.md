# Mapa inicial de domínios

| Módulo        | Responsabilidade                                                                | Fora da autoridade                 |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| Organizations | organizations, locations, memberships e grants                                  | catálogo e pedidos                 |
| Catalog       | categories, products, variants/modifiers futuros, preço/oferta conforme decisão | execução de flow                   |
| Flows         | definição, versões, grafo, sessões e engine                                     | preço, estoque, pagamento, authz   |
| Cart          | intenção de compra e itens referenciados                                        | preço final e criação de pagamento |
| Orders        | snapshot comercial, lifecycle e state machine                                   | editor de flow                     |
| Inventory     | disponibilidade/estoque futuro                                                  | preço e pagamento                  |
| Delivery      | dados e lifecycle de entrega futuros                                            | order lifecycle geral              |
| Payments      | boundary e estado de pagamento futuro                                           | integração concreta nesta fase     |
| Customers     | identidade/perfil de consumidor conforme consentimento                          | usuário administrativo             |

Analytics Events e Audit Logs são capacidades transversais com contratos próprios: analytics descreve comportamento de produto; audit registra ações relevantes para segurança e operação. Eles não substituem eventos de domínio.

As relações e aggregates definitivos serão documentados por módulo antes das respectivas migrations.

Implementado neste incremento: [Organizations, Locations e Memberships](organizations.md).

Implementado: [Catalog](catalog.md).
