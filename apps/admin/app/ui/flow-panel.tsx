'use client';

import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type { FlowNodeConfig, FlowNodeType } from '@delivery/domain';
import {
  createCatalogGateway,
  createFlowGateway,
  type BrowserDatabaseClient,
} from '@delivery/database';
import {
  createFlowSchema,
  flowNodeConfigSchema,
  flowNodeInputSchema,
} from '@delivery/schemas';
import {
  stageLabels,
  toPersistedPosition,
  toReactFlowGraph,
  type EditorNodeData,
  type PersistedEditorEdge,
  type PersistedEditorNode,
} from './flow-editor-adapter';

type FlowRow = {
  id: string;
  name: string;
  slug: string;
  published_version_id: string | null;
  flow_versions?: { id: string; status: string; version_number: number }[];
};
type CatalogItem = { id: string; name: string; category_id?: string };
type ValidationIssue = { code: string; nodeId?: string };
type Validation = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

const library: { group: string; types: FlowNodeType[] }[] = [
  { group: 'Orientar', types: ['TEXT', 'CHOICE'] },
  {
    group: 'Mostrar produtos',
    types: ['CATEGORY', 'PRODUCT_LIST', 'PRODUCT', 'UPSELL'],
  },
  { group: 'Concluir', types: ['CART', 'DELIVERY', 'CHECKOUT', 'END'] },
];
const issueMessages: Record<string, string> = {
  MISSING_START: 'A jornada precisa indicar onde o atendimento começa.',
  MULTIPLE_START: 'A jornada possui mais de um início.',
  MISSING_END: 'Esta jornada precisa de uma etapa de encerramento.',
  INVALID_EDGE: 'Um próximo passo é inválido.',
  CROSS_VERSION_EDGE: 'Um próximo passo pertence a outra versão.',
  START_HAS_INBOUND: 'O início não pode receber conexões.',
  END_HAS_OUTBOUND: 'O encerramento não pode ter próximo passo.',
  MISSING_OUTPUT: 'Uma etapa ainda não possui próximo passo.',
  MISSING_BRANCH_DESTINATION: 'Uma opção ainda não possui próximo passo.',
  UNREACHABLE_NODE: 'Esta etapa não pode ser alcançada pelos clientes.',
  INVALID_NODE_CONFIG: 'Revise os campos obrigatórios desta etapa.',
  INVALID_CATALOG_REFERENCE:
    'Um produto usado nesta jornada não está mais disponível.',
  UNKNOWN_NODE_TYPE: 'Existe uma etapa de tipo desconhecido.',
  CYCLE_DETECTED: 'Existe um caminho circular nesta jornada.',
};

function JourneyStage({ data, selected }: NodeProps) {
  const value = data as EditorNodeData;
  return (
    <div
      className={`journey-stage journey-stage--${value.kind.toLowerCase()} ${selected ? 'is-selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <span className="stage-kind">{stageLabels[value.kind]}</span>
      <strong>{value.label}</strong>
      <small>{value.summary}</small>
      {value.kind !== 'END' && (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}

const minimumConfig = (
  type: FlowNodeType,
  categories: CatalogItem[],
  products: CatalogItem[],
): FlowNodeConfig | null => {
  if (type === 'TEXT') return { type, title: 'Nova mensagem' };
  if (type === 'CHOICE')
    return {
      type,
      title: 'Nova pergunta',
      options: [{ key: 'opcao-1', label: 'Opção 1' }],
    };
  if (type === 'CATEGORY')
    return categories[0] ? { type, categoryIds: [categories[0].id] } : null;
  if (type === 'PRODUCT_LIST')
    return categories[0] ? { type, categoryId: categories[0].id } : null;
  if (type === 'PRODUCT')
    return products[0] ? { type, productId: products[0].id } : null;
  if (type === 'UPSELL')
    return products[0] ? { type, productIds: [products[0].id] } : null;
  if (type === 'END') return { type, title: 'Até logo!' };
  return { type };
};

export function FlowPanel({
  client,
  locationId,
}: {
  client: BrowserDatabaseClient;
  locationId: string;
}) {
  const gateway = useMemo(() => createFlowGateway(client), [client]);
  const catalogGateway = useMemo(() => createCatalogGateway(client), [client]);
  const [flows, setFlows] = useState<FlowRow[]>([]),
    [activeFlow, setActiveFlow] = useState<FlowRow | null>(null);
  const [versionId, setVersionId] = useState(''),
    [nodes, setNodes] = useState<PersistedEditorNode[]>([]),
    [edges, setEdges] = useState<PersistedEditorEdge[]>([]);
  const [selectedId, setSelectedId] = useState(''),
    [categories, setCategories] = useState<CatalogItem[]>([]),
    [products, setProducts] = useState<CatalogItem[]>([]);
  const [saveState, setSaveState] = useState<
    'saved' | 'pending' | 'saving' | 'error'
  >('saved');
  const [message, setMessage] = useState(''),
    [validation, setValidation] = useState<Validation | null>(null),
    [preview, setPreview] = useState(false);
  const graph = useMemo(() => toReactFlowGraph(nodes, edges), [nodes, edges]);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    const result = await gateway.list(locationId);
    if (result.error) return setMessage(result.error.message);
    setFlows((result.data ?? []) as FlowRow[]);
  }, [gateway, locationId]);
  const load = useCallback(
    async (id: string) => {
      const result = await gateway.definition(id);
      if (result.nodes.error || result.edges.error)
        return setMessage(
          result.nodes.error?.message ??
            result.edges.error?.message ??
            'Não foi possível abrir a jornada.',
        );
      const rows = (result.nodes.data ?? []) as PersistedEditorNode[];
      const normalized: PersistedEditorNode[] = [];
      for (const node of rows) {
        const parsed = flowNodeConfigSchema.safeParse({
          ...node.config,
          type: node.type,
        });
        if (!parsed.success) {
          setMessage(
            'Uma etapa possui configuração inválida e não pode ser editada.',
          );
          return;
        }
        normalized.push({ ...node, config: parsed.data as FlowNodeConfig });
      }
      setVersionId(id);
      setNodes(normalized);
      setEdges((result.edges.data ?? []) as PersistedEditorEdge[]);
      setSaveState('saved');
      setValidation(null);
    },
    [gateway],
  );
  useEffect(() => {
    void refresh();
    void catalogGateway.list(locationId).then(({ data }) => {
      const value = data as {
        categories?: CatalogItem[];
        products?: CatalogItem[];
      } | null;
      setCategories(value?.categories ?? []);
      setProducts(value?.products ?? []);
    });
  }, [catalogGateway, locationId, refresh]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = createFlowSchema.safeParse({
      locationId,
      name: form.get('name'),
      slug: form.get('slug'),
    });
    if (!parsed.success)
      return setMessage(parsed.error.issues[0]?.message ?? 'Revise os dados.');
    const result = await gateway.create(
      locationId,
      parsed.data.name,
      parsed.data.slug,
    );
    if (result.error) return setMessage(result.error.message);
    event.currentTarget.reset();
    await refresh();
    setMessage('Jornada criada. Abra para começar a montar.');
  }
  async function open(flow: FlowRow) {
    const result = await gateway.ensureDraft(flow.id);
    if (result.error) return setMessage(result.error.message);
    setActiveFlow(flow);
    await load(String(result.data));
  }
  async function addStage(type: FlowNodeType) {
    const config = minimumConfig(type, categories, products);
    if (!config)
      return setMessage(
        'Cadastre ao menos um item no Catálogo antes de adicionar esta etapa.',
      );
    const parsed = flowNodeInputSchema.safeParse({
      flowVersionId: versionId,
      name: stageLabels[type],
      config,
    });
    if (!parsed.success)
      return setMessage(
        'Não foi possível criar uma configuração inicial válida.',
      );
    setSaveState('saving');
    const result = await gateway.addNode({
      flow_version_id: versionId,
      type,
      name: stageLabels[type],
      config,
      editor_metadata: {},
    });
    if (result.error) {
      setSaveState('error');
      return setMessage(result.error.message);
    }
    const row = result.data as PersistedEditorNode;
    setNodes((current) => [...current, row]);
    setSelectedId(row.id);
    setSaveState('saved');
    setMessage('Etapa adicionada. Configure os detalhes.');
  }
  function patchSelected(config: FlowNodeConfig) {
    if (!selected) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selected.id ? { ...node, config } : node,
      ),
    );
    setSaveState('pending');
  }
  useEffect(() => {
    if (saveState !== 'pending' || !selected) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSaveState('saving');
        const parsed = flowNodeInputSchema.safeParse({
          flowVersionId: versionId,
          name: selected.name ?? undefined,
          config: selected.config,
          position: selected.editor_metadata?.position,
        });
        if (!parsed.success) {
          setSaveState('error');
          return setMessage(
            parsed.error.issues[0]?.message ?? 'Revise os campos da etapa.',
          );
        }
        const result = await gateway.updateNode(
          selected.id,
          selected.updated_at,
          {
            name: selected.name,
            config: selected.type === 'START' ? {} : parsed.data.config,
            editor_metadata: selected.editor_metadata ?? {},
          },
        );
        if (result.error || !result.data) {
          setSaveState('error');
          return setMessage(
            result.error?.message ??
              'A jornada mudou em outra tela. Recarregue antes de continuar.',
          );
        }
        setNodes((current) =>
          current.map((node) =>
            node.id === selected.id
              ? (result.data as PersistedEditorNode)
              : node,
          ),
        );
        setSaveState('saved');
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [gateway, saveState, selected, versionId]);

  async function saveBranches(
    source: PersistedEditorNode,
    values: { choiceKey?: string; targetNodeId: string; sortOrder: number }[],
  ) {
    setSaveState('saving');
    const result = await gateway.replaceBranches(source.id, values);
    if (result.error) {
      setSaveState('error');
      return setMessage(result.error.message);
    }
    await load(versionId);
    setSelectedId(source.id);
    setMessage('Próximos passos salvos.');
  }
  async function validate() {
    const result = await gateway.validate(versionId);
    if (result.error) return setMessage(result.error.message);
    setValidation(result.data as Validation);
  }
  async function publish() {
    const result = await gateway.validate(versionId);
    if (result.error) return setMessage(result.error.message);
    const value = result.data as Validation;
    setValidation(value);
    if (!value.valid)
      return setMessage('Corrija os problemas antes de publicar.');
    if (!window.confirm('Publicar esta jornada para os clientes?')) return;
    const published = await gateway.publish(versionId);
    if (published.error) return setMessage(published.error.message);
    setMessage('Jornada publicada.');
    setActiveFlow(null);
    setVersionId('');
    await refresh();
  }

  if (!activeFlow)
    return (
      <section className="card stack" data-testid="journeys-list">
        <div>
          <h2>Jornadas</h2>
          <p>Monte o atendimento da loja e publique quando estiver pronto.</p>
        </div>
        <p aria-live="polite">{message}</p>
        <form className="inline-form" onSubmit={(event) => void create(event)}>
          <input
            name="name"
            placeholder="Nome da jornada"
            required
            minLength={2}
          />
          <input name="slug" placeholder="endereco-da-jornada" required />
          <button>Criar</button>
        </form>
        <div className="journey-list">
          {flows.map((flow) => (
            <button
              className="journey-list-item"
              key={flow.id}
              onClick={() => void open(flow)}
            >
              <strong>{flow.name}</strong>
              <span>
                {flow.published_version_id ? 'Publicado' : 'Rascunho'}
              </span>
            </button>
          ))}
        </div>
      </section>
    );

  return (
    <section className="flow-builder" data-testid="flow-builder">
      <header className="builder-toolbar">
        <button className="secondary" onClick={() => setActiveFlow(null)}>
          ← Voltar
        </button>
        <div>
          <strong>{activeFlow.name}</strong>
          <span className={`save-state save-state--${saveState}`}>
            {saveState === 'saved'
              ? 'Salvo'
              : saveState === 'pending'
                ? 'Alterações pendentes'
                : saveState === 'saving'
                  ? 'Salvando…'
                  : 'Falha ao salvar'}
          </span>
        </div>
        <div className="toolbar-actions">
          <button className="secondary" onClick={() => setPreview(true)}>
            Prévia
          </button>
          <button
            disabled={saveState !== 'saved'}
            onClick={() => void publish()}
          >
            Publicar
          </button>
        </div>
      </header>
      <aside className="stage-library">
        <h3>Biblioteca</h3>
        {library.map((section) => (
          <section key={section.group}>
            <h4>{section.group}</h4>
            {section.types.map((type) => (
              <button
                key={type}
                disabled={!versionId}
                onClick={() => void addStage(type)}
              >
                ＋ {stageLabels[type]}
              </button>
            ))}
          </section>
        ))}
      </aside>
      <div className="journey-canvas">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={{ journeyStage: JourneyStage }}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onNodeDragStop={(_, node) => {
            const current = nodes.find((item) => item.id === node.id);
            if (!current) return;
            setNodes((items) =>
              items.map((item) =>
                item.id === node.id
                  ? { ...item, editor_metadata: toPersistedPosition(node) }
                  : item,
              ),
            );
            setSelectedId(node.id);
            setSaveState('pending');
          }}
          fitView
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="stage-config">
        <h3>Configurar etapa</h3>
        {selected ? (
          <StageForm
            node={selected}
            nodes={nodes}
            edges={edges}
            categories={categories}
            products={products}
            onChange={patchSelected}
            onBranches={(branches) => void saveBranches(selected, branches)}
          />
        ) : (
          <p>Selecione uma etapa para editar.</p>
        )}
      </aside>
      <footer className="builder-validation">
        <div>
          <strong>Problemas da jornada</strong>
          <p aria-live="polite">{message || 'Valide antes de publicar.'}</p>
        </div>
        <button className="secondary" onClick={() => void validate()}>
          Validar jornada
        </button>
        {validation && (
          <ul>
            {validation.errors.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <strong>Bloqueia publicação:</strong>{' '}
                {issueMessages[issue.code] ?? 'Revise esta etapa.'}
              </li>
            ))}
            {validation.warnings.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <strong>Recomenda-se revisar:</strong>{' '}
                {issueMessages[issue.code] ?? 'Revise esta etapa.'}
              </li>
            ))}
            {validation.valid && (
              <li className="validation-ok">Tudo pronto para publicar.</li>
            )}
          </ul>
        )}
      </footer>
      {preview && (
        <div
          className="preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Prévia da jornada"
        >
          <div className="preview-phone">
            <button className="secondary" onClick={() => setPreview(false)}>
              Fechar prévia
            </button>
            <span>Prévia privada do rascunho</span>
            <PreviewStage
              node={
                selected ??
                nodes.find((node) => node.type === 'START') ??
                nodes[0]
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewStage({ node }: { node: PersistedEditorNode | undefined }) {
  if (!node) return <p>Adicione uma etapa.</p>;
  const config = node.config;
  return (
    <article className="preview-card">
      <small>{stageLabels[node.type]}</small>
      <h3>{'title' in config ? config.title : node.name}</h3>
      {config.type === 'CHOICE' &&
        config.options.map((option) => (
          <button key={option.key}>{option.label}</button>
        ))}
      <p>Selecione etapas no quadro para conferir sua apresentação.</p>
    </article>
  );
}

function StageForm({
  node,
  nodes,
  edges,
  categories,
  products,
  onChange,
  onBranches,
}: {
  node: PersistedEditorNode;
  nodes: PersistedEditorNode[];
  edges: PersistedEditorEdge[];
  categories: CatalogItem[];
  products: CatalogItem[];
  onChange: (config: FlowNodeConfig) => void;
  onBranches: (
    branches: { choiceKey?: string; targetNodeId: string; sortOrder: number }[],
  ) => void;
}) {
  const config = node.config;
  const outgoing = edges.filter((edge) => edge.source_node_id === node.id);
  const targets = nodes.filter(
    (item) => item.id !== node.id && item.type !== 'START',
  );
  const select = (value: string, items: CatalogItem[], multiple = false) =>
    multiple
      ? items
          .filter((item) => value.split(',').includes(item.id))
          .map((item) => item.id)
      : value;
  if (node.type === 'START')
    return (
      <NextStepForm
        outgoing={outgoing}
        targets={targets}
        onSave={(targetNodeId) =>
          onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
        }
      />
    );
  if (config.type === 'TEXT' || config.type === 'END')
    return (
      <div className="config-form">
        <label>
          Título
          <input
            value={config.title ?? ''}
            onChange={(event) =>
              onChange({ ...config, title: event.target.value })
            }
          />
        </label>
        {config.type === 'TEXT' && (
          <label>
            Mensagem
            <textarea
              value={config.body ?? ''}
              onChange={(event) =>
                onChange({ ...config, body: event.target.value })
              }
            />
          </label>
        )}
        {config.type !== 'END' && (
          <NextStepForm
            outgoing={outgoing}
            targets={targets}
            onSave={(targetNodeId) =>
              onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
            }
          />
        )}
      </div>
    );
  if (config.type === 'CHOICE')
    return (
      <div className="config-form">
        <label>
          Pergunta
          <input
            value={config.title}
            onChange={(event) =>
              onChange({ ...config, title: event.target.value })
            }
          />
        </label>
        {config.options.map((option, index) => (
          <div className="choice-editor" key={option.key}>
            <label>
              Opção
              <input
                value={option.label}
                onChange={(event) =>
                  onChange({
                    ...config,
                    options: config.options.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              Próximo passo
              <select
                defaultValue={
                  outgoing.find(
                    (edge) => edge.condition_config.choiceKey === option.key,
                  )?.target_node_id ?? ''
                }
                data-choice={option.key}
              >
                <option value="">Selecionar etapa</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name ?? stageLabels[target.type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <button
          className="secondary"
          onClick={() =>
            onChange({
              ...config,
              options: [
                ...config.options,
                {
                  key: `opcao-${crypto.randomUUID().slice(0, 8)}`,
                  label: `Opção ${config.options.length + 1}`,
                },
              ],
            })
          }
        >
          Adicionar opção
        </button>
        <button
          onClick={(event) => {
            const root = event.currentTarget.parentElement!;
            onBranches(
              config.options
                .map((option, index) => ({
                  choiceKey: option.key,
                  targetNodeId: (
                    root.querySelector(
                      `[data-choice="${option.key}"]`,
                    ) as HTMLSelectElement
                  ).value,
                  sortOrder: index,
                }))
                .filter((branch) => branch.targetNodeId),
            );
          }}
        >
          Salvar próximos passos
        </button>
      </div>
    );
  if (config.type === 'CATEGORY')
    return (
      <div className="config-form">
        <label>
          Categorias
          <select
            multiple
            value={[...config.categoryIds]}
            onChange={(event) =>
              onChange({
                ...config,
                categoryIds: Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
              })
            }
          >
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <NextStepForm
          outgoing={outgoing}
          targets={targets}
          onSave={(targetNodeId) =>
            onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
          }
        />
      </div>
    );
  if (config.type === 'PRODUCT_LIST')
    return (
      <div className="config-form">
        <label>
          Categoria
          <select
            value={config.categoryId ?? ''}
            onChange={(event) =>
              onChange({ type: 'PRODUCT_LIST', categoryId: event.target.value })
            }
          >
            <option value="">Selecione</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <NextStepForm
          outgoing={outgoing}
          targets={targets}
          onSave={(targetNodeId) =>
            onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
          }
        />
      </div>
    );
  if (config.type === 'PRODUCT')
    return (
      <div className="config-form">
        <label>
          Produto
          <select
            value={config.productId}
            onChange={(event) =>
              onChange({
                ...config,
                productId: select(event.target.value, products) as string,
              })
            }
          >
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <NextStepForm
          outgoing={outgoing}
          targets={targets}
          onSave={(targetNodeId) =>
            onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
          }
        />
      </div>
    );
  if (config.type === 'UPSELL')
    return (
      <div className="config-form">
        <label>
          Produtos
          <select
            multiple
            value={[...config.productIds]}
            onChange={(event) =>
              onChange({
                ...config,
                productIds: Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
              })
            }
          >
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <NextStepForm
          outgoing={outgoing}
          targets={targets}
          onSave={(targetNodeId) =>
            onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
          }
        />
      </div>
    );
  return (
    <NextStepForm
      outgoing={outgoing}
      targets={targets}
      onSave={(targetNodeId) =>
        onBranches(targetNodeId ? [{ targetNodeId, sortOrder: 0 }] : [])
      }
    />
  );
}

function NextStepForm({
  outgoing,
  targets,
  onSave,
}: {
  outgoing: PersistedEditorEdge[];
  targets: PersistedEditorNode[];
  onSave: (targetId: string) => void;
}) {
  const [target, setTarget] = useState(outgoing[0]?.target_node_id ?? '');
  return (
    <div className="next-step">
      <label>
        Próximo passo
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">Selecionar etapa</option>
          {targets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name ?? stageLabels[item.type]}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => onSave(target)}>Salvar próximo passo</button>
    </div>
  );
}
