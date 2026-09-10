import { test, expect, type Route } from "@playwright/test";
import QRCode from "qrcode";
import { LocalUrlAnalyzer, UrlRiskEngine } from "@scanly/url-safety";

const analysis = (url: string, malicious = false) => new UrlRiskEngine().aggregate(new LocalUrlAnalyzer().analyze(url), {
  reputation: { status: "complete", results: [{ provider: "test-fixture", status: malicious ? "match" : "no_match", threats: malicious ? ["MALWARE"] : [], operation: "lookup" }] },
});
async function upload(page: import("@playwright/test").Page, text: string) {
  await page.getByTestId("upload-input").setInputFiles({ name: "url-safety.png", mimeType: "image/png", buffer: await QRCode.toBuffer(text, { width: 360, margin: 4 }) });
  await expect(page.getByTestId("decoded-output")).toHaveValue(text, { timeout: 30_000 });
}
test.beforeEach(async ({ page }) => { await page.goto("/"); await page.getByRole("tab", { name: "Upload" }).click(); });

test("URL safety is disabled by default and local-only never sends requests @smoke", async ({ page }) => {
  let calls = 0; await page.route("**/api/url-safety", async (route) => { calls++; await route.abort(); });
  await expect(page.getByLabel("URL Safety Analysis (optional)")).toHaveValue("disabled");
  await upload(page, "https://example.com/?token=secret"); expect(calls).toBe(0);
  await page.getByLabel("URL Safety Analysis (optional)").selectOption("local-only");
  await expect(page.getByTestId("url-safety-status")).toContainText("UNKNOWN"); expect(calls).toBe(0);
  await expect(page.getByTestId("url-safety-panel")).not.toContainText("token=secret");
});
test("non-URL confirmed payloads never enter the network layer @smoke", async ({ page }) => {
  let calls = 0; await page.route("**/api/url-safety", async (route) => { calls++; await route.abort(); });
  await page.getByLabel("URL Safety Analysis (optional)").selectOption("remote");
  for (const text of ["plain text", "WIFI:T:WPA;S:home;P:secret;;", "BEGIN:VCARD\nFN:Person\nEND:VCARD"]) await upload(page, text);
  expect(calls).toBe(0);
});
test("barcode is visible before network completion and high-risk opening requires confirmation @smoke", async ({ page }) => {
  let pending: Route | undefined;
  await page.route("**/api/url-safety", (route) => { pending = route; });
  await page.getByLabel("URL Safety Analysis (optional)").selectOption("remote");
  const url = "https://example.com/malware"; await upload(page, url);
  await expect(page.getByTestId("url-safety-status")).toContainText("ANALYZING");
  await expect.poll(() => !!pending).toBe(true);
  await pending!.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analysis(url, true)) });
  await expect(page.getByTestId("url-safety-status")).toContainText("CRITICAL");
  const button = page.getByTestId("open-link-button"); await expect(button).toHaveText("Open anyway"); await expect(button).not.toHaveClass(/primary/);
  const dialog = page.waitForEvent("dialog"); const click = button.click(); const warning = await dialog; expect(warning.message()).toContain("High-risk"); await warning.dismiss(); await click;
});
test("a late URL A response cannot overwrite URL B @smoke", async ({ page }) => {
  let late: Route | undefined;
  await page.route("**/api/url-safety", async (route) => {
    const { url } = route.request().postDataJSON();
    if (url.includes("a.example.com")) { late = route; return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analysis(url)) });
  });
  await page.getByLabel("URL Safety Analysis (optional)").selectOption("remote");
  await upload(page, "https://a.example.com/"); await expect.poll(() => !!late).toBe(true);
  await upload(page, "https://b.example.com/");
  await expect(page.getByTestId("url-safety-panel")).toContainText("b.example.com");
  await late!.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analysis("https://a.example.com/", true)) }).catch(() => {});
  await expect(page.getByTestId("url-safety-panel")).not.toContainText("CRITICAL");
  await expect(page.getByTestId("url-safety-panel")).toContainText("b.example.com");
});
