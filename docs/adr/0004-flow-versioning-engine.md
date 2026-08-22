# ADR-0004: Versionamento e execução de flows

**Status:** Proposed

## Contexto

Clientes em sessão não podem mudar de jornada durante uma publicação. React Flow é editor, não runtime nem modelo de domínio.

## Decisão

Manter Flow como identidade, draft editável e FlowVersion publicada imutável contendo snapshot validado. FlowSession fixa `flowVersionId`. Um Flow Engine puro executa contrato próprio de nodes/edges; adapter traduz dados do React Flow no boundary.

## Alternativas consideradas

- Editar o grafo publicado: quebra sessões e auditabilidade.
- Executar diretamente JSON do React Flow: acopla runtime a uma biblioteca de UI.
- Copiar versão a cada keystroke: histórico excessivo sem valor operacional.

## Consequências

Reprodutibilidade e rollout seguro; requer validação de publicação, controle de concorrência e política futura de retenção/migração de schema de node.
