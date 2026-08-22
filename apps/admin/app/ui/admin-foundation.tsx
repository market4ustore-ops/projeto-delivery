'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createBrowserDatabaseClient } from '@delivery/database';
import { CatalogPanel } from './catalog-panel';
import { FlowPanel } from './flow-panel';
import {
  createLocationSchema,
  createOrganizationSchema,
  locationRowsSchema,
  organizationRowsSchema,
  signInSchema,
  type LocationRow,
  type OrganizationRow,
} from '@delivery/schemas';

export function AdminFoundation() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createBrowserDatabaseClient(url, key) : null;
  }, []);
  const [authenticated, setAuthenticated] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [selected, setSelected] = useState('');
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [message, setMessage] = useState(
    client
      ? 'Autentique-se para começar.'
      : 'Configure as variáveis Supabase em .env.local.',
  );

  const refreshOrganizations = async () => {
    if (!client) return;
    const response = await client.rpc('list_my_organizations');
    if (response.error) return setMessage(response.error.message);
    const parsed = organizationRowsSchema.safeParse(response.data);
    if (!parsed.success)
      return setMessage('Resposta inválida ao listar organizações.');
    const rows = parsed.data;
    setOrganizations(rows);
    setSelected((current) => current || rows[0]?.id || '');
  };

  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      if (data.session) void refreshOrganizations();
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
      if (session) void refreshOrganizations();
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!client || !selected) {
      setLocations([]);
      return;
    }
    void client
      .rpc('list_my_locations', { target_organization_id: selected })
      .then(({ data, error }) => {
        if (error) setMessage(error.message);
        else {
          const parsed = locationRowsSchema.safeParse(data);
          if (parsed.success) setLocations(parsed.data);
          else setMessage('Resposta inválida ao listar unidades.');
        }
      });
  }, [client, selected]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success)
      return setMessage(parsed.error.issues[0]?.message ?? 'Dados inválidos');
    const { error } = await client.auth.signInWithPassword(parsed.data);
    setMessage(error?.message ?? 'Autenticado.');
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const parsed = createOrganizationSchema.safeParse({
      name: new FormData(event.currentTarget).get('name'),
    });
    if (!parsed.success)
      return setMessage(parsed.error.issues[0]?.message ?? 'Nome inválido');
    const { error } = await client.rpc('create_organization', {
      organization_name: parsed.data.name,
    });
    if (error) return setMessage(error.message);
    event.currentTarget.reset();
    setMessage('Organização criada.');
    await refreshOrganizations();
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !selected) return;
    const parsed = createLocationSchema.safeParse({
      organizationId: selected,
      name: new FormData(event.currentTarget).get('name'),
    });
    if (!parsed.success)
      return setMessage(parsed.error.issues[0]?.message ?? 'Dados inválidos');
    const { error } = await client.rpc('create_location', {
      target_organization_id: selected,
      location_name: parsed.data.name,
    });
    if (error) return setMessage(error.message);
    event.currentTarget.reset();
    setMessage('Unidade criada.');
    const response = await client.rpc('list_my_locations', {
      target_organization_id: selected,
    });
    const parsedRows = locationRowsSchema.safeParse(response.data);
    if (parsedRows.success) setLocations(parsedRows.data);
    else setMessage('Resposta inválida ao listar unidades.');
  }

  if (!authenticated)
    return (
      <section className="card">
        <h1>Delivery Admin</h1>
        <p>{message}</p>
        <form onSubmit={(event) => void signIn(event)}>
          <label>
            E-mail
            <input name="email" type="email" required />
          </label>
          <label>
            Senha
            <input name="password" type="password" minLength={8} required />
          </label>
          <button disabled={!client}>Entrar</button>
        </form>
      </section>
    );
  return (
    <section className="stack">
      <header>
        <div>
          <h1>Fundação multi-tenant</h1>
          <p>{message}</p>
        </div>
        <button
          className="secondary"
          onClick={() => void client?.auth.signOut()}
        >
          Sair
        </button>
      </header>
      <div className="grid">
        <article className="card">
          <h2>Organizações</h2>
          <form onSubmit={(event) => void createOrganization(event)}>
            <label>
              Nome
              <input name="name" minLength={2} maxLength={120} required />
            </label>
            <button>Criar organização</button>
          </form>
          <label>
            Organização ativa
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Selecione</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role})
                </option>
              ))}
            </select>
          </label>
        </article>
        <article className="card">
          <h2>Unidades acessíveis</h2>
          <form onSubmit={(event) => void createLocation(event)}>
            <label>
              Nome
              <input name="name" minLength={2} maxLength={120} required />
            </label>
            <button disabled={!selected}>Criar unidade</button>
          </form>
          <ul>
            {locations.map((location) => (
              <li key={location.id}>
                <button
                  className="secondary"
                  onClick={() => setSelectedLocation(location.id)}
                >
                  {location.name}
                </button>
              </li>
            ))}
          </ul>
          {selected && locations.length === 0 && (
            <p>Nenhuma unidade acessível.</p>
          )}
        </article>
      </div>
      {client && selectedLocation && (
        <>
          <CatalogPanel client={client} locationId={selectedLocation} />
          <FlowPanel client={client} locationId={selectedLocation} />
        </>
      )}
    </section>
  );
}
