import { expect, test } from '@playwright/test';
const states = [
  { type: 'TEXT', title: 'Bem-vindo', body: 'Monte sua jornada.' },
  {
    type: 'CHOICE',
    title: 'Qual tipo?',
    options: [{ key: 'burger', label: 'Burger' }],
  },
  { type: 'CATEGORY', categories: [{ id: 'c', name: 'Lanches' }] },
  {
    type: 'PRODUCT_LIST',
    products: [{ id: 'p', name: 'Burger', price: '29.90', available: true }],
  },
  {
    type: 'PRODUCT',
    product: { id: 'p', name: 'Burger', price: '29.90', available: true },
  },
  {
    type: 'UPSELL',
    products: [{ id: 'u', name: 'Batata', price: '9.90', available: true }],
  },
  { type: 'BOUNDARY', boundary: 'CART' },
  { type: 'BOUNDARY', boundary: 'DELIVERY' },
  { type: 'BOUNDARY', boundary: 'CHECKOUT' },
  { type: 'END', title: 'Pedido finalizado' },
] as const;
test('walks a published flow through every public node view', async ({
  page,
}) => {
  let step = 0;
  await page.route('**/api/public/flows/start', (r) =>
    r.fulfill({
      json: {
        publicToken: 'a'.repeat(64),
        revision: 0,
        status: 'ACTIVE',
        render: states[0],
        completed: false,
      },
    }),
  );
  await page.route('**/api/public/sessions/advance', async (r) => {
    const body = r.request().postDataJSON() as {
      action: { type: string; choiceKey?: string };
    };
    if (step === 1)
      expect(body.action).toEqual({
        type: 'SELECT_CHOICE',
        choiceKey: 'burger',
      });
    step++;
    await r.fulfill({
      json: {
        publicToken: 'a'.repeat(64),
        revision: step,
        status: step === 9 ? 'COMPLETED' : 'ACTIVE',
        render: states[step],
        completed: step === 9,
      },
    });
  });
  await page.goto('/r/loja/menu');
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByText('Bem-vindo')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Qual tipo?')).toBeVisible();
  await page.getByRole('button', { name: 'Burger' }).click();
  for (const text of [
    'Categorias',
    'Produtos',
    'Burger',
    'Você também pode gostar',
    'CART',
    'DELIVERY',
    'CHECKOUT',
  ]) {
    await expect(
      page.getByRole('heading', { name: text, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();
  }
  await expect(page.getByText('Pedido finalizado')).toBeVisible();
  expect(step).toBe(9);
});
test('shows a safe error for unavailable flow', async ({ page }) => {
  await page.route('**/api/public/flows/start', (r) =>
    r.fulfill({ status: 404, json: { error: 'FLOW_NOT_AVAILABLE' } }),
  );
  await page.goto('/r/unknown/unknown');
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('.panel [role="alert"]')).toContainText(
    'não está disponível',
  );
});
test('offers restart when a session expires', async ({ page }) => {
  await page.route('**/api/public/flows/start', (r) =>
    r.fulfill({
      json: {
        publicToken: 'a'.repeat(64),
        revision: 0,
        status: 'ACTIVE',
        render: states[0],
        completed: false,
      },
    }),
  );
  await page.route('**/api/public/sessions/advance', (r) =>
    r.fulfill({ status: 410, json: { error: 'SESSION_EXPIRED' } }),
  );
  await page.goto('/r/loja/menu');
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.panel [role="alert"]')).toContainText('expirou');
  await expect(
    page.getByRole('button', { name: 'Reiniciar sessão' }),
  ).toBeVisible();
});
