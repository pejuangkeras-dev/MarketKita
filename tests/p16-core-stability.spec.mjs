import { test, expect } from "@playwright/test";

const BASE_URL = process.env.MARKETKITA_BASE_URL || "https://marketkita.pages.dev";
const RAW_BASE = "https://raw.githubusercontent.com/pejuangkeras-dev/MarketKita/main/";

async function raw(request, path) {
  const response = await request.get(RAW_BASE + path);
  expect(response.ok(), "Source unavailable: " + path).toBeTruthy();
  return response.text();
}

test.describe("P16 — Core Stability & Recovery", () => {
  test("production homepage renders the marketplace shell without page errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));

    const response = await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/MarketKita/i);
    await expect(page.locator("#products")).toBeVisible();
    await expect(page.locator("#cartBtn")).toBeVisible();
    await expect(page.locator("#loginBtn")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("all inline homepage scripts compile before execution", async ({ request }) => {
    const html = await raw(request, "index.html");
    const scripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
      .map(match => match[1])
      .filter(source => source.trim());

    expect(scripts.length).toBeGreaterThan(0);

    const styleOpen = (html.match(/<style(?:\\s[^>]*)?>/gi) || []).length;
    const styleClose = (html.match(/<\\/style>/gi) || []).length;
    expect(styleOpen).toBe(styleClose);
    expect(html).not.toMatch(/<\\/style>\\s*<\\/style>/i);
    expect(html).toContain('<link rel="stylesheet" href="/marketkita-design-v3.css?v=3">');

    const failures = [];
    for (let i = 0; i < scripts.length; i++) {
      try {
        new Function(scripts[i]);
      } catch (error) {
        failures.push(`script[${i}]: ${error?.message || error}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test("public catalog/config remain healthy", async ({ request }) => {
    const [products, config] = await Promise.all([
      request.get(BASE_URL + "/api/public-products"),
      request.get(BASE_URL + "/api/public-config")
    ]);

    expect(products.ok()).toBeTruthy();
    expect(config.ok()).toBeTruthy();

    const productBody = await products.json();
    const configBody = await config.json();

    expect(Array.isArray(productBody.products)).toBeTruthy();
    expect(configBody.supabaseUrl).toMatch(/^https?:\\/\\//);
    expect(configBody.supabaseAnonKey).toBeTruthy();
    expect(configBody.clientKey).toBeTruthy();
    expect(configBody.snapUrl).toMatch(/^https?:\\/\\//);
  });

  test("checkout cannot be invoked anonymously", async ({ request }) => {
    const response = await request.post(BASE_URL + "/api/create-transaction", {
      data: { items: [], customer: {} }
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Login diperlukan untuk checkout.");
  });

  test("critical stability protections exist in source", async ({ request }) => {
    const middleware = await raw(request, "functions/api/_middleware.js");
    const createTransaction = await raw(request, "functions/api/create-transaction.js");
    const publicProducts = await raw(request, "functions/api/public-products.js");

    for (const marker of [
      "/api/create-transaction",
      "/api/shipping-quote",
      "RATE_LIMITED",
      "X-Content-Type-Options",
      "Referrer-Policy"
    ]) {
      expect(middleware).toContain(marker);
    }

    expect(createTransaction).toContain("Login diperlukan untuk checkout.");
    expect(publicProducts).toContain("status=eq.active");
    expect(publicProducts).toContain("price=gt.0");
  });
});
