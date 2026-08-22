# ADR-0001: Monólito modular em monorepo

**Status:** Accepted

## Contexto

Há três experiências web e vários domínios, mas o produto ainda precisa validar seu primeiro slice. Distribuição precoce elevaria custo de transação, deploy e observabilidade.

## Decisão

Usar pnpm/Turborepo com três apps Next.js e packages compartilhados. Executar como monólito modular, preservando APIs públicas e ownership de módulo; deploys podem ser separados por app sem transformar domínios em serviços.

## Alternativas consideradas

- Microservices por domínio: rejeitado por complexidade operacional e consistência distribuída prematuras.
- Um único app/pacote sem fronteiras: simples inicialmente, mas facilita acoplamento entre UI e negócio.
- Packages independentes para cada módulo desde já: isolamento forte, porém ceremony excessivo nesta fase.

## Consequências

Transações locais e desenvolvimento simples; exige fiscalização automática de imports. Extração futura é possível, mas não é objetivo nem promessa.
