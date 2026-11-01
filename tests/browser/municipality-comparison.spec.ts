import { expect, test } from "@playwright/test";

test("compara Papuda com Brasília inteira, mantém a unidade ao trocar turno e exporta os dois recortes", async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  await page.goto("./");
  await expect(page.getByText("Selecione uma unidade na lista para comparar", { exact: false })).toBeVisible();
  await page.getByLabel("Buscar unidade ou município").fill("PAPUDA");
  await page.locator(".unit-card").click();
  const comparison = page.locator("#comparacao-municipal");
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("Município inteiro, incluindo as seções da própria unidade.");
  await expect(comparison).toContainText("BRASÍLIA · DF");
  const bolsonaro = comparison.locator('[data-candidate="22"]');
  await expect(bolsonaro.locator(".comparison-unit-votes")).toHaveText("57 votos");
  await expect(bolsonaro.locator(".comparison-city-votes")).toHaveText("1.041.331 votos");
  await expect(bolsonaro.locator(".comparison-unit-percent")).toHaveText("54,29%");
  await expect(bolsonaro.locator(".comparison-city-percent")).toHaveText("58,81%");
  await expect(bolsonaro.locator(".comparison-difference")).toContainText("-4,53 p.p.");
  await expect(comparison.locator('[data-candidate="13"] .comparison-difference')).toContainText("+4,53 p.p.");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar dados do recorte" }).click();
  const stream = await (await event).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(payload.results).toHaveLength(1);
  expect(payload.results[0].valid).toBe(105);
  expect(payload.municipality_comparison.scope).toBe("entire_municipality_including_units");
  expect(payload.municipality_comparison.municipality.valid).toBe(1770626);
  expect(payload.municipality_comparison.municipality.total).toBe(1838492);
  // A comparação usa o total inteiro, não subtrai os 105 votos da unidade.
  expect(payload.municipality_comparison.municipality.candidates.find((c: { number: number }) => c.number === 22).votes).toBe(1041331);
  await page.getByRole("combobox", { name: "Turno", exact: true }).selectOption("1");
  await expect(comparison).toContainText("1º turno");
  await expect(bolsonaro.locator(".comparison-unit-votes")).toHaveText("59 votos");
  await expect(bolsonaro.locator(".comparison-city-votes")).toHaveText("910.397 votos");
  const tableWidth = await comparison.locator("table").evaluate(element => element.getBoundingClientRect().width);
  const captionWidth = await comparison.locator("caption").evaluate(element => element.getBoundingClientRect().width);
  expect(captionWidth).toBeGreaterThan(tableWidth * 0.9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("combobox", { name: "Eleição", exact: true }).selectOption("2018");
  await expect(comparison).toHaveCount(0);
  await expect(page.locator(".comparison-prompt")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("trocar unidade atualiza o município e ausência de votos da unidade não vira zero", async ({ page }) => {
  await page.goto("./");
  const search = page.getByLabel("Buscar unidade ou município");
  await search.fill("PAPUDA"); await page.locator(".unit-card").click();
  const comparison = page.locator("#comparacao-municipal");
  await expect(comparison).toContainText("BRASÍLIA · DF");
  await search.fill("COMPLEXO PENITENCIÁRIO DO PURAQUEQUARA");
  await expect(comparison).toHaveCount(0);
  await page.locator(".unit-card").click();
  await expect(comparison).toContainText("MANAUS · AM");
  await expect(comparison).toContainText("O resultado da unidade não está disponível");
  await expect(comparison.locator("tbody tr")).toHaveCount(0);
});
