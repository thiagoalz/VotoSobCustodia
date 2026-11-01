import { expect, test } from "@playwright/test";

test("preserva o contexto e não apresenta ausência de dados como zero votos", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const siteOrigin = new URL(testInfo.project.use.baseURL!).origin;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== siteOrigin) {
      externalRequests.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("O direito ao voto");
  await expect(page.getByText("Arquivos oficiais preservados localmente.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar dados do recorte" })).toBeDisabled();

  await page.getByRole("combobox", { name: "Eleição", exact: true }).selectOption("2018");
  await page.getByRole("combobox", { name: "Turno", exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Socioeducativas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Socioeducativas", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".result-context")).toContainText("2018 · 1º turno");
  await page.getByLabel("Buscar unidade ou município").fill("unidade inexistente");
  await expect(page.getByText("O cadastro começa pela verificação.")).toBeVisible();

  const state = page.getByRole("button", { name: "Filtrar por Distrito Federal", exact: true });
  await state.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toHaveValue("DF");
  await expect(page.locator(".result-context")).toContainText("DF");
  await page.getByRole("button", { name: "Um estado sem resultados não teve votação nessas unidades?" }).click();
  await expect(page.getByText("Não é possível concluir isso.", { exact: false })).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await page.getByRole("navigation").getByRole("link", { name: "Resultados", exact: true }).click();
    await expect(page).toHaveURL(/#resultados$/);
    await expect(page.getByRole("button", { name: "Abrir navegação" })).toHaveAttribute("aria-expanded", "false");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
