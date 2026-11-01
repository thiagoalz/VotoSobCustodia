import { expect, test } from "@playwright/test";

test("exibe votos reais do DF, permite download e preserva contexto e filtros", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const origin = new URL(testInfo.project.use.baseURL!).origin;
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("O direito ao voto");
  await expect(page.getByText("Votos oficiais por seção publicados.", { exact: false })).toBeVisible();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("DF");
  // Valores conferidos no recorte de oito seções do arquivo oficial e no inventário local.
  const summary = page.locator(".result-summary");
  await expect(summary.getByText("382", { exact: true })).toBeVisible();
  await expect(page.locator(".candidate").filter({ hasText: "LUIZ INÁCIO LULA DA SILVA" })).toContainText("251 votos");
  await expect(page.locator(".candidate").filter({ hasText: "JAIR MESSIAS BOLSONARO" })).toContainText("131 votos");
  await expect(page.locator(".candidate").filter({ hasText: "LUIZ INÁCIO LULA DA SILVA" })).toContainText("65,71% dos válidos");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar dados do recorte" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(payload.year).toBe(2022);
  expect(payload.turn).toBe(2);
  expect(payload.results).toHaveLength(8);
  expect(payload.coverage.matched_sections).toBe(8);
  expect(payload.results.reduce((sum: number, row: { total: number }) => sum + row.total, 0)).toBe(389);
  await page.getByLabel("Buscar unidade ou município").fill("PAPUDA");
  await expect(summary.getByText("105", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Socioeducativas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Socioeducativas", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Buscar unidade ou município").fill("unidade certamente inexistente 000xyz");
  await expect(page.getByText("Nenhuma unidade neste recorte", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar dados do recorte" })).toBeDisabled();
  await page.getByRole("button", { name: "Mostrar todos os locais" }).click();
  await expect(page.getByRole("button", { name: "Baixar dados do recorte" })).toBeEnabled();
  await page.getByRole("button", { name: "A classificar", exact: true }).click();
  const state = page.getByRole("button", { name: "Filtrar por Distrito Federal", exact: true });
  await state.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toHaveValue("DF");
  await expect(summary.getByText("382", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Um estado sem resultados não teve votação nessas unidades?" }).click();
  await expect(page.getByText("Não é possível concluir isso.", { exact: false })).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await page.getByRole("navigation").getByRole("link", { name: "Resultados", exact: true }).click();
    await expect(page).toHaveURL(/#resultados$/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("cada eleição e turno apresenta candidatos e votos, em vez de um catálogo vazio", async ({ page }) => {
  await page.goto("./");
  for (const year of [2018, 2022, 2026]) {
    await page.getByRole("combobox", { name: "Eleição", exact: true }).selectOption(String(year));
    for (const turn of [1, 2]) {
      await page.getByRole("combobox", { name: "Turno", exact: true }).selectOption(String(turn));
      await expect(page.locator(".result-context")).toContainText(`${year} · ${turn}º turno`);
      expect(await page.locator(".candidate").count()).toBeGreaterThan(1);
      await expect(page.getByRole("button", { name: "Baixar dados do recorte" })).toBeEnabled();
      await expect(page.locator(".result-summary")).toContainText("votos válidos");
      await expect(page.locator(".results-empty")).toHaveCount(0);
    }
  }
});
