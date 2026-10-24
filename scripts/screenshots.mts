// Captures the README screenshots in docs/screenshots from a running dev server.
// Usage: start `npm run dev` on an empty database, then `npm run screenshots`.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
// The page body doesn't scroll (<main> does), so "full page" = grow the viewport to the content height.
const shot = async (name: string, fullPage = false) => {
  await page.waitForTimeout(900);
  if (fullPage) {
    const h = await page.evaluate(() => (document.querySelector("main")?.scrollHeight ?? 0) + 70);
    await page.setViewportSize({ width: 1440, height: Math.max(900, Math.min(h, 4000)) });
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (fullPage) await page.setViewportSize({ width: 1440, height: 900 });
  console.log("saved", name);
};

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await shot("00-empty-start");

// New Analysis window (filled with the sample)
await page.getByRole("button", { name: "New Analysis" }).first().click();
await page.getByText("Fill with Relay CRM sample").click();
await shot("01-new-analysis");
await page.getByRole("button", { name: "Cancel" }).click();

// Load the demo and wait for the agent to finish
await page.getByRole("button", { name: "Load demo data" }).click();
await page.waitForTimeout(2500);
await shot("02-agent-running");
await page.getByText("all tools returned").waitFor({ timeout: 60_000 });
await shot("03-overview");
await shot("03-overview-full", true);

const go = async (href: string) => {
  await page.locator(`nav a[href="${href}"]`).click();
  await page.waitForLoadState("networkidle");
};
await go("/analysis");
await shot("04-ai-search-analysis", true);
await go("/competitors");
await shot("05-competitors", true);
await go("/opportunities");
await shot("06-opportunities", true);
await go("/queries");
await shot("07-queries");
await page.locator("main tbody tr").first().click();
await page.waitForTimeout(800);
await page.getByText(/Show per-assistant results/).first().click();
await shot("08-evidence-drawer");
await page.getByRole("button", { name: "Close" }).last().click();
await go("/experiments");
await shot("09-experiments", true);
await go("/insights");
await shot("10-visibility-insights", true);
await go("/citations");
await shot("11-citation-intelligence", true);
await go("/gaps");
await shot("12-content-gaps");
await go("/monitoring");
await shot("13-monitoring");
await go("/reports");
await shot("14-reports");

await browser.close();
