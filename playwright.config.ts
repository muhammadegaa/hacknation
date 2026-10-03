import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";

// Use the preinstalled Chromium; never download a browser.
function chromiumPath(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => d.startsWith("chromium-") && !d.includes("headless"));
  const candidates = dir ? [`${base}/${dir}/chrome-linux/chrome`, `${base}/${dir}/chrome-linux64/chrome`] : [];
  return [...candidates, `${base}/chromium`].find((p) => existsSync(p));
}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: chromiumPath(), args: ["--no-sandbox"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
