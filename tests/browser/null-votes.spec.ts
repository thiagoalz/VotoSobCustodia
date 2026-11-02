import { expect, test } from "@playwright/test";
import dataset from "../../public/data/null-votes.json";

const format = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

test("abre estudo nacional, preserva 00, ordena numericamente e exporta sem consultas externas", async ({ page }, testInfo) => {
  const origin = new URL(testInfo.project.use.baseURL!).origin;
  const external: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  expect(dataset.status).toBe("complete");
  expect(dataset.processed_ufs).toHaveLength(27);
  await page.goto("./");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("link", { name: "Votos nulos", exact: true }).click();
  await expect(page).toHaveURL(/\/votos-nulos\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("voto nulo.");
  await expect(page.locator(".null-scope")).toContainText("Presidente · 2026 · 2º turno");
  await expect(page.locator(".null-pending")).toHaveCount(0);
  await expect(page.locator(".null-verified")).toContainText("27 UFs");
  await page.getByText("Cobertura e arquivos por UF", { exact: true }).click();
  await expect(page.locator(".null-coverage tbody tr")).toHaveCount(27);
  await expect(page.locator(".null-coverage tbody tr").first()).toBeVisible();
  const rows = page.locator(".null-table tbody tr");
  await expect(rows).toHaveCount(dataset.rows.length);
  await expect(rows.first().locator("code")).toHaveText(dataset.rows[0].number);
  await expect(rows.first().locator(".null-total strong")).toHaveText(format(dataset.rows[0].votes));
  await expect(rows.first().locator(".null-uf")).toContainText(dataset.rows[0].top_ufs.join(""));
  const search = page.getByRole("searchbox", { name: "Buscar número digitado" });
  await search.fill("00");
  const zero = dataset.rows.find(row => row.number === "00")!;
  await expect(rows).toHaveCount(1);
  await expect(rows.locator("code")).toHaveText("00");
  await expect(rows.locator(".null-total strong")).toHaveText(format(zero.votes));
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar CSV", exact: true }).click();
  const download = await event; const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain(`"00";"${zero.votes}";`);
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  await search.fill("");
  await page.getByRole("button", { name: "Ordenar por Total de votos", exact: true }).click();
  await expect(page.locator('thead [data-column="votes"]')).toHaveAttribute("aria-sort", "ascending");
  const values = await rows.locator(".null-total strong").allTextContents();
  const numeric = values.map(value => Number(value.replaceAll(".", "")));
  expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
  await search.fill("999999");
  await expect(page.getByText("Nenhum número encontrado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar CSV", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Limpar busca", exact: true }).click();
  await expect(rows).toHaveCount(dataset.rows.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
