import { expect, test } from '@playwright/test';

test('creates, publishes and executes a visual journey', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const apiUrl = process.env.API_URL?.replace(/^['"]|['"]$/g, '');
  const anonKey = process.env.ANON_KEY?.replace(/^['"]|['"]$/g, '');
  test.skip(!apiUrl || !anonKey, 'Requires the local Supabase stack.');
  const email = `builder-${Date.now()}@test.local`;
  const password = 'FlowBuilder123!';
  const signup = await request.post(`${apiUrl}/auth/v1/signup`, {
    headers: { apikey: anonKey!, Authorization: `Bearer ${anonKey}` },
    data: { email, password },
  });
  expect(signup.ok()).toBeTruthy();
  const token = ((await signup.json()) as { access_token: string })
    .access_token;
  const authenticatedHeaders = {
    apikey: anonKey!,
    Authorization: `Bearer ${token}`,
  };
  const organization = await request.post(
    `${apiUrl}/rest/v1/rpc/create_organization`,
    {
      headers: authenticatedHeaders,
      data: { organization_name: 'Loja Builder' },
    },
  );
  expect(organization.ok()).toBeTruthy();
  const organizationId = (await organization.json()) as string;
  const location = await request.post(`${apiUrl}/rest/v1/rpc/create_location`, {
    headers: authenticatedHeaders,
    data: {
      target_organization_id: organizationId,
      location_name: 'Unidade Centro',
    },
  });
  expect(location.ok()).toBeTruthy();
  const locationId = (await location.json()) as string;
  const categoryId = crypto.randomUUID();
  const category = await request.post(`${apiUrl}/rest/v1/categories`, {
    headers: { ...authenticatedHeaders, Prefer: 'return=minimal' },
    data: {
      id: categoryId,
      location_id: locationId,
      name: 'Hambúrguer',
      slug: 'hamburguer',
    },
  });
  expect(category.ok()).toBeTruthy();
  const product = await request.post(`${apiUrl}/rest/v1/products`, {
    headers: { ...authenticatedHeaders, Prefer: 'return=minimal' },
    data: {
      location_id: locationId,
      category_id: categoryId,
      name: 'X-Burger',
      slug: 'x-burger',
      base_price: '29.90',
    },
  });
  expect(product.ok()).toBeTruthy();
  const flow = await request.post(`${apiUrl}/rest/v1/rpc/create_flow`, {
    headers: authenticatedHeaders,
    data: {
      target_location_id: locationId,
      flow_name: 'Atendimento principal',
      flow_slug: 'atendimento-principal',
    },
  });
  expect(flow.ok()).toBeTruthy();

  await page.goto('http://127.0.0.1:3000');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fundação multi-tenant' }),
  ).toBeVisible();

  await page.getByLabel('Organização ativa').selectOption(organizationId);
  await page.getByRole('button', { name: 'Unidade Centro' }).click();

  const journeys = page.getByTestId('journeys-list');
  await journeys.getByRole('button', { name: /Atendimento principal/ }).click();
  await expect(page.getByTestId('flow-builder')).toBeVisible();

  await page.getByRole('button', { name: '＋ Pergunta' }).click();
  await expect(
    page.getByText('Etapa adicionada. Configure os detalhes.'),
  ).toBeVisible();
  const config = page.locator('.stage-config');
  await config.getByLabel('Pergunta').fill('O que você deseja?');
  await config.getByLabel('Opção').fill('Hambúrguer');
  await config.getByRole('button', { name: 'Adicionar opção' }).click();
  await config.getByLabel('Opção').nth(1).fill('Pizza');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '＋ Lista de produtos' }).click();
  await page.getByRole('button', { name: '＋ Lista de produtos' }).click();
  await page.getByRole('button', { name: '＋ Encerramento' }).click();
  await page.locator('.journey-stage--start').click();
  await config.getByLabel('Próximo passo').selectOption({ label: 'Pergunta' });
  await config.getByRole('button', { name: 'Salvar próximo passo' }).click();

  await page.locator('.journey-stage--choice').click();
  const branchSelects = config.getByLabel('Próximo passo');
  await branchSelects.nth(0).selectOption({ index: 1 });
  await branchSelects.nth(1).selectOption({ index: 2 });
  await config.getByRole('button', { name: 'Salvar próximos passos' }).click();
  for (const stage of [
    page.locator('.journey-stage--product_list').nth(0),
    page.locator('.journey-stage--product_list').nth(1),
  ]) {
    await stage.click();
    await config
      .getByLabel('Próximo passo')
      .selectOption({ label: 'Encerramento' });
    await config.getByRole('button', { name: 'Salvar próximo passo' }).click();
  }

  await page.getByRole('button', { name: 'Validar jornada' }).click();
  await expect(page.getByText('Tudo pronto para publicar.')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Jornada publicada.')).toBeVisible();

  const locationResponse = await request.get(
    `${apiUrl}/rest/v1/locations?select=slug&name=eq.Unidade%20Centro`,
    { headers: { apikey: anonKey!, Authorization: `Bearer ${token}` } },
  );
  const locations = (await locationResponse.json()) as { slug: string }[];
  await page.goto(
    `http://127.0.0.1:3001/r/${locations[0]!.slug}/atendimento-principal`,
  );
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByText('O que você deseja?')).toBeVisible();
  await page.getByRole('button', { name: 'Hambúrguer' }).click();
  await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Até logo!')).toBeVisible();
});
