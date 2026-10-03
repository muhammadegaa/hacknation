import { expect, test, type Page } from "@playwright/test";
import { apScenario as S } from "../src/domain/scenario-ap";
import type { LookupKey } from "../src/domain/types";

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

// What an experienced analyst would open before deciding (beyond the PO panel).
const EXTRA_LOOKUP: Record<string, LookupKey | undefined> = {
  "INV-2041": "contract",
  "INV-2044": "bank_log",
  "INV-2042/A": "dup_search",
  "INV-2047": "contract",
};

const agentLines = (page: Page) => page.locator(".line.agent");

test("capture: asks only where the expert departs from the manual, builds a verified Work Map, then the tutor teaches", async ({
  page,
}) => {
  await page.goto("/?fast=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?fast=1");
  await shot(page, "01-landing");

  await page.getByTestId("mode-sim").click();
  await page.getByTestId("start-capture").click();
  await expect(agentLines(page)).toHaveCount(1); // Pip's greeting
  await expect(page.getByTestId("voice-state")).toHaveText("Watching quietly");

  let lines = 1;
  for (const [i, c] of S.captureCases.entries()) {
    await expect(page.getByTestId("invoice")).toContainText(c.invoice.id);
    const extra = EXTRA_LOOKUP[c.invoice.id];
    if (extra) await page.getByTestId(`tab-${extra}`).click();
    await page.getByTestId(`act-${c.expertAction}`).click();

    if (c.ruleKey) {
      // Pip asks one question…
      await expect(agentLines(page)).toHaveCount(lines + 1);
      if (c.invoice.id === "INV-2044") await shot(page, "02-capture-question");
      lines++;
      // …the expert answers in their own words…
      await page.getByTestId("compose-input").fill(c.expertSays);
      await page.getByTestId("compose-input").press("Enter");
      await expect(page.getByTestId("insight")).toHaveCount(S.captureCases.slice(0, i + 1).filter((x) => x.ruleKey).length);
      // …Pip plays it back, the expert confirms, the rule is verified.
      await expect(agentLines(page)).toHaveCount(lines + 1);
      lines++;
      await page.getByTestId("compose-input").fill("Yes, exactly.");
      await page.getByTestId("compose-input").press("Enter");
      await expect(agentLines(page)).toHaveCount(lines + 1);
      lines++;
    }

    if (i < S.captureCases.length - 1) await page.getByTestId("next-invoice").click();
  }

  // Restraint: it asked about the six rule cases and stayed quiet on the two routine ones.
  await expect(page.getByTestId("asked-count")).toHaveText("6");
  await expect(page.getByTestId("silent-count")).toHaveText("1"); // INV-2048 settles on finish
  await shot(page, "03-capture-mapped");

  // Closing sweep.
  await page.getByTestId("finish-capture").click();
  await expect(page.getByTestId("silent-count")).toHaveText("2");
  await expect(agentLines(page)).toHaveCount(lines + 1);
  lines++;
  await page.getByTestId("compose-input").fill("Invoices that arrive on a Friday afternoon. People rush and skip the bank check.");
  await page.getByTestId("compose-input").press("Enter");
  await expect(page.getByTestId("view-map")).toBeVisible();

  // The Work Map.
  await page.getByTestId("view-map").click();
  await expect(page.getByTestId("kpi-hidden")).toHaveText("+0"); // only the live agent calls new_step
  await expect(page.getByTestId("kpi-rules")).toHaveText("7");
  await expect(page.getByTestId("bench-score")).toHaveText("6 of 6");
  await expect(page.locator('[data-kind="guardrail"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="guardrail"]')).toContainText("bank");
  await expect(page.locator('[data-kind="exception"]').first()).toContainText("Brightline");
  await expect(page.locator('[data-kind="escalation"]')).toContainText("New vendor");
  await expect(page.getByTestId("step").filter({ hasText: "Not in the manual" })).toHaveCount(0); // sim does not invent new steps
  await shot(page, "04-workmap");

  // Persisted across reload.
  await page.reload();
  await expect(page.getByTestId("start-tutor")).toContainText("my captured map");

  // Tutor, fed by the captured map.
  await page.goto("/?fast=1");
  await page.getByTestId("mode-sim").click();
  await page.getByTestId("start-tutor").click();
  await expect(page.getByTestId("invoice")).toContainText("INV-3101", { timeout: 10_000 }); // tutor called next_case after the intro
  await shot(page, "05-tutor");
  // No peeking: during practice every rule is locked until a related invoice has been tried.
  await expect(page.getByTestId("locked-insight")).toHaveCount(6);

  // Trap + hint ladder on the first invoice: wrong, wrong, then right.
  const tutorLines = () => page.locator(".line.agent").count();
  const before = await tutorLines();
  await page.getByTestId("act-reject").click();
  await expect(page.getByTestId("locked-insight")).toHaveCount(5); // fuel-surcharge rule unlocks after an attempt
  await expect.poll(tutorLines).toBeGreaterThan(before); // Socratic hint, no answer
  const hint = (await page.locator(".line.agent").last().innerText()).toLowerCase();
  expect(hint).not.toContain("fuel");
  const b2 = await tutorLines();
  await page.getByTestId("act-hold").click();
  await expect.poll(tutorLines).toBeGreaterThan(b2); // reveal with the expert's words
  await expect(page.locator(".line.agent").last()).toContainText("Maria says");
  await page.getByTestId("act-approve").click();
  await expect(page.getByTestId("act-approve")).toHaveClass(/good/);

  // Work through the rest correctly.
  for (const tc of S.traineeCases.slice(1)) {
    await page.getByTestId("next-case").click();
    await expect(page.getByTestId("invoice")).toContainText(tc.invoice.id);
    await page.getByTestId(`act-${tc.expectedAction}`).click();
    await expect(page.getByTestId(`act-${tc.expectedAction}`)).toHaveClass(/good/);
  }
  await page.getByTestId("finish-practice").click();
  await expect(page.getByTestId("scorecard")).toBeVisible();
  // 6 right first time + 1 after hints = 6.5 / 7
  await expect(page.getByTestId("score")).toHaveText("93%");
  await shot(page, "06-scorecard");
});

test("saved example map: hidden steps are shown as not in the manual", async ({ page }) => {
  await page.goto("/?fast=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?fast=1");
  await page.getByTestId("mode-sim").click();
  await page.getByTestId("start-tutor").click();
  await expect(page.getByTestId("hidden-steps")).toHaveText("2 hidden steps");
  await expect(page.getByTestId("step").filter({ hasText: "Not in the manual" })).toHaveCount(2);
  await expect(page.getByTestId("rule-count")).toContainText("6 rules · 6 verified");
  await expect(page.locator('[data-kind="guardrail"]')).toContainText("Hard stop");
});
