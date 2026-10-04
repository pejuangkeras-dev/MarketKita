import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.MARKETKITA_BASE_URL ||
  "https://marketkita.pages.dev";

test.describe("MarketKita Core Production Smoke", () => {
  test("homepage loads without browser errors and exposes marketplace shell", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));

    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/MarketKita/i);

    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("#products")).toBeVisible();
    await expect(page.locator("#cartBtn")).toBeVisible();
    await expect(page.locator("#loginBtn")).toBeVisible();

    expect(errors, "Browser page errors: " + errors.join(" | ")).toEqual([]);
  });

  test("public catalog and public config APIs are reachable", async ({ request }) => {
    const products = await request.get(BASE_URL + "/api/public-products");
    expect(products.ok()).toBeTruthy();
    const productBody = await products.json();
    expect(Array.isArray(productBody.products)).toBeTruthy();

    const config = await request.get(BASE_URL + "/api/public-config");
    expect(config.ok()).toBeTruthy();
    const configBody = await config.json();
    expect(configBody.supabaseUrl).toMatch(/^https?:\\/\\//);
    expect(configBody.supabaseAnonKey).toBeTruthy();
    expect(configBody.clientKey).toBeTruthy();
    expect(configBody.snapUrl).toMatch(/^https?:\\/\\//);
  });

  test("homepage scripts remain syntactically valid", async ({ page }) => {
    const failures = await page.evaluate(() => {
      const scripts = [...document.scripts]
        .map((script, index) => ({ index, source: script.textContent || "" }))
        .filter(item => item.source.trim());

      return scripts.flatMap(item => {
        try {
          new Function(item.source);
          return [];
        } catch (error) {
          return [`script[${item.index}]: ${error?.message || error}`];
        }
      });
    });

    expect(failures).toEqual([]);
  });

  test("checkout remains protected behind authentication", async ({ request }) => {
    const response = await request.post(BASE_URL + "/api/create-transaction", {
      data: {
        items: [],
        customer: {}
      }
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Login diperlukan untuk checkout.");
  });
});
