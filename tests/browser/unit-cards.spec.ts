import { expect, test } from "@playwright/test";

test("o mapa alterna entre estado e Brasil, preserva filtros e limpa a unidade selecionada", async ({ page }, testInfo) => {
  await page.goto("./");
  const mapState = page.getByRole("button", { name: "Filtrar por São Paulo", exact: true });
  const stateSelect = page.getByRole("combobox", { name: "Estado", exact: true });
  const activate = async () => {
    if (testInfo.project.name === "mobile") await mapState.tap();
    else await mapState.click();
  };
  await page.getByRole("button", { name: "A classificar", exact: true }).click();
  await page.getByLabel("Buscar unidade ou município").fill("UNIDADE");
  const allCount = await page.locator(".unit-card").count();
  expect(allCount).toBeGreaterThan(0);
  await activate();
  await expect(stateSelect).toHaveValue("SP");
  await expect(mapState).toHaveAttribute("aria-pressed", "true");
  await expect(mapState).toHaveClass(/selected/);
  const cards = page.locator('.unit-card:has(.unit-leader[data-status="winner"])');
  expect(await cards.count()).toBeGreaterThan(1);
  const otherCardText = await cards.nth(1).locator(".unit-leader").textContent();
  await cards.first().click();
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  // Selecionar uma unidade não apaga a liderança dos demais cartões.
  await expect(cards.nth(1).locator(".unit-leader")).toHaveText(otherCardText!);
  await activate();
  await expect(stateSelect).toHaveValue("all");
  await expect(mapState).toHaveAttribute("aria-pressed", "false");
  await expect(mapState).not.toHaveClass(/selected/);
  await expect(page.locator(".unit-card.chosen")).toHaveCount(0);
  await expect(page.locator(".unit-card")).toHaveCount(allCount);
  await expect(page.getByRole("combobox", { name: "Eleição", exact: true })).toHaveValue("2022");
  await expect(page.getByRole("combobox", { name: "Turno", exact: true })).toHaveValue("2");
  await expect(page.getByRole("button", { name: "A classificar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Buscar unidade ou município")).toHaveValue("UNIDADE");
  await mapState.focus(); await page.keyboard.press("Enter");
  await expect(stateSelect).toHaveValue("SP");
  await page.keyboard.press("Space");
  await expect(stateSelect).toHaveValue("all");
  await activate();
  const otherState = page.getByRole("button", { name: "Filtrar por Minas Gerais", exact: true });
  await otherState.focus(); await page.keyboard.press("Enter");
  await expect(stateSelect).toHaveValue("MG");
  await expect(mapState).toHaveAttribute("aria-pressed", "false");
});

test("cartões mostram mais votado, votos, percentual, empate e resultado indisponível", async ({ page }) => {
  await page.goto("./");
  const search = page.getByLabel("Buscar unidade ou município");
  const year = page.getByRole("combobox", { name: "Eleição", exact: true });
  const turn = page.getByRole("combobox", { name: "Turno", exact: true });
  await search.fill("PAPUDA");
  const leader = page.locator(".unit-card .unit-leader");
  await expect(leader).toHaveAttribute("data-status", "winner");
  await expect(leader).toContainText("Mais votado");
  await expect(leader).toContainText("JAIR MESSIAS BOLSONARO");
  await expect(leader).toContainText("57 votos · 54,29% dos votos válidos");
  await turn.selectOption("1");
  await expect(leader).toContainText("59 votos · 52,21% dos votos válidos");
  await year.selectOption("2018");
  await search.fill("CPFCOL - CENTRO PRISIONAL FEMININO DE COLATINA");
  await expect(leader).toHaveAttribute("data-status", "tie");
  await expect(leader).toContainText("Empate na liderança");
  await expect(leader.locator(".unit-leader-name")).toHaveText(["FERNANDO HADDAD", "JAIR MESSIAS BOLSONARO"]);
  await expect(leader.locator(".unit-leader-votes")).toHaveText([
    "13 votos · 38,24% dos votos válidos", "13 votos · 38,24% dos votos válidos",
  ]);
  await year.selectOption("2022");
  await search.fill("COMPLEXO PENITENCIÁRIO DO PURAQUEQUARA");
  await expect(leader).toHaveAttribute("data-status", "unavailable");
  await expect(leader).toHaveText("Resultado indisponível");
  await expect(leader.locator(".unit-leader-name")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
