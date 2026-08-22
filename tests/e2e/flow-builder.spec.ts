import { expect, test } from '@playwright/test';

test('creates, publishes and executes a visual journey', async ({
  page,
  request,
}) => {
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

  await page.goto('http://127.0.0.1:3000');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fundação multi-tenant' }),
  ).toBeVisible();

  await page.getByLabel('Nome').first().fill('Loja Builder');
  await page.getByRole('button', { name: 'Criar organização' }).click();
  await expect(page.getByLabel('Organização ativa')).toContainText(
    'Loja Builder',
  );
  await page
    .getByRole('article')
    .filter({ hasText: 'Unidades acessíveis' })
    .getByLabel('Nome')
    .fill('Unidade Centro');
  await page.getByRole('button', { name: 'Criar unidade' }).click();
  await page.getByRole('button', { name: 'Unidade Centro' }).click();

  const catalog = page
    .getByRole('heading', { name: 'Catálogo da unidade' })
    .locator('..');
  await catalog.getByPlaceholder('Nome').first().fill('Hambúrguer');
  await catalog.getByPlaceholder('slug').first().fill('hamburguer');
  await catalog.getByRole('button', { name: 'Criar categoria' }).click();
  await catalog.getByPlaceholder('Nome').nth(1).fill('X-Burger');
  await catalog.getByPlaceholder('slug').nth(1).fill('x-burger');
  await catalog.getByPlaceholder('29.90').fill('29.90');
  await catalog
    .getByRole('combobox')
    .first()
    .selectOption({ label: 'Hambúrguer' });
  await catalog.getByRole('button', { name: 'Criar produto' }).click();

  const journeys = page.getByTestId('journeys-list');
  await journeys
    .getByPlaceholder('Nome da jornada')
    .fill('Atendimento principal');
  await journeys
    .getByPlaceholder('endereco-da-jornada')
    .fill('atendimento-principal');
  await journeys.getByRole('button', { name: 'Criar' }).click();
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

  const token = ((await signup.json()) as { access_token: string })
    .access_token;
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
