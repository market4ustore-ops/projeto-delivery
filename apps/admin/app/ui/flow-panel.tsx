'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  createFlowGateway,
  type BrowserDatabaseClient,
} from '@delivery/database';
import {
  createFlowSchema,
  flowEdgeInputSchema,
  flowNodeInputSchema,
} from '@delivery/schemas';
type Row = {
  id: string;
  name?: string;
  slug?: string;
  type?: string;
  status?: string;
  version_number?: number;
  flow_versions?: Row[];
  config?: Record<string, unknown>;
  source_node_id?: string;
  target_node_id?: string;
};
const defaultConfig = (type: string): Record<string, unknown> =>
  type === 'TEXT'
    ? { type, title: 'Texto' }
    : type === 'CHOICE'
      ? { type, title: 'Escolha', options: [{ key: 'opcao', label: 'Opção' }] }
      : type === 'CATEGORY'
        ? { type, categoryIds: [] }
        : type === 'PRODUCT_LIST'
          ? { type, productIds: [] }
          : type === 'PRODUCT'
            ? { type, productId: '' }
            : type === 'UPSELL'
              ? { type, productIds: [] }
              : { type };
export function FlowPanel({
  client,
  locationId,
}: {
  client: BrowserDatabaseClient;
  locationId: string;
}) {
  const gateway = useMemo(() => createFlowGateway(client), [client]),
    [flows, setFlows] = useState<Row[]>([]),
    [flowId, setFlowId] = useState(''),
    [versionId, setVersionId] = useState(''),
    [nodes, setNodes] = useState<Row[]>([]),
    [edges, setEdges] = useState<Row[]>([]),
    [status, setStatus] = useState('');
  const refresh = useCallback(async () => {
    const r = await gateway.list(locationId);
    if (r.error) setStatus(r.error.message);
    else setFlows((r.data ?? []) as Row[]);
  }, [gateway, locationId]);
  const load = useCallback(
    async (id: string) => {
      setVersionId(id);
      const r = await gateway.definition(id);
      if (r.nodes.error || r.edges.error)
        setStatus(r.nodes.error?.message ?? r.edges.error?.message ?? 'Erro');
      else {
        setNodes((r.nodes.data ?? []) as Row[]);
        setEdges((r.edges.data ?? []) as Row[]);
      }
    },
    [gateway],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = createFlowSchema.safeParse({
        locationId,
        name: f.get('name'),
        slug: f.get('slug'),
      });
    if (!p.success) return setStatus(p.error.issues[0]?.message ?? 'Inválido');
    const r = await gateway.create(locationId, p.data.name, p.data.slug);
    if (r.error) setStatus(r.error.message);
    else {
      e.currentTarget.reset();
      await refresh();
    }
  }
  async function draft(id: string) {
    setFlowId(id);
    const r = await gateway.ensureDraft(id);
    if (r.error) setStatus(r.error.message);
    else await load(String(r.data));
  }
  async function node(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      rawType = f.get('type'),
      type = typeof rawType === 'string' ? rawType : '',
      p = flowNodeInputSchema.safeParse({
        flowVersionId: versionId,
        name: f.get('name') || undefined,
        config: defaultConfig(type),
      });
    if (!p.success)
      return setStatus('Config inicial exige IDs válidos para este tipo.');
    const r = await gateway.addNode({
      flow_version_id: versionId,
      type,
      name: p.data.name,
      config: p.data.config,
    });
    if (r.error) setStatus(r.error.message);
    else await load(versionId);
  }
  async function edge(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = flowEdgeInputSchema.safeParse({
        flowVersionId: versionId,
        sourceNodeId: f.get('source'),
        targetNodeId: f.get('target'),
        condition: { type: 'ALWAYS' },
        sortOrder: 0,
      });
    if (!p.success) return setStatus('Edge inválido.');
    const r = await gateway.addEdge({
      flow_version_id: versionId,
      source_node_id: p.data.sourceNodeId,
      target_node_id: p.data.targetNodeId,
      condition_type: 'ALWAYS',
    });
    if (r.error) setStatus(r.error.message);
    else await load(versionId);
  }
  async function validate() {
    const r = await gateway.validate(versionId);
    setStatus(r.error?.message ?? JSON.stringify(r.data));
  }
  async function publish() {
    const r = await gateway.publish(versionId);
    if (r.error) setStatus(r.error.message);
    else {
      setStatus('Flow publicado.');
      await refresh();
    }
  }
  return (
    <section className="card stack">
      <h2>Flows da unidade</h2>
      <p aria-live="polite">{status}</p>
      <form onSubmit={(e) => void create(e)}>
        <input name="name" placeholder="Nome" required />
        <input name="slug" placeholder="slug" required />
        <button>Criar Flow</button>
      </form>
      <ul>
        {flows.map((f) => (
          <li key={f.id}>
            <strong>{f.name}</strong> ({f.slug}){' '}
            <button className="secondary" onClick={() => void draft(f.id)}>
              Obter draft
            </button>
            <ul>
              {f.flow_versions?.map((v) => (
                <li key={v.id}>
                  v{v.version_number} {v.status}{' '}
                  <button className="secondary" onClick={() => void load(v.id)}>
                    Ver
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {flowId && versionId && (
        <>
          <h3>Definição textual</h3>
          <form onSubmit={(e) => void node(e)}>
            <select name="type">
              {[
                'START',
                'TEXT',
                'CHOICE',
                'CATEGORY',
                'PRODUCT_LIST',
                'PRODUCT',
                'UPSELL',
                'CART',
                'DELIVERY',
                'CHECKOUT',
                'END',
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input name="name" placeholder="Nome opcional" />
            <button>Adicionar node</button>
          </form>
          <form onSubmit={(e) => void edge(e)}>
            <select name="source" required>
              <option value="">Origem</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name ?? n.type}
                </option>
              ))}
            </select>
            <select name="target" required>
              <option value="">Destino</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name ?? n.type}
                </option>
              ))}
            </select>
            <button>Adicionar edge ALWAYS</button>
          </form>
          <ul>
            {nodes.map((n) => (
              <li key={n.id}>
                {n.type}: {n.name ?? 'sem nome'} — {JSON.stringify(n.config)}
              </li>
            ))}
          </ul>
          <ul>
            {edges.map((e) => (
              <li key={e.id}>
                {e.source_node_id} → {e.target_node_id}
              </li>
            ))}
          </ul>
          <button onClick={() => void validate()}>Validar</button>{' '}
          <button onClick={() => void publish()}>Publicar</button>
        </>
      )}
    </section>
  );
}
