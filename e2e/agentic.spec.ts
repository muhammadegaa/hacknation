import { expect, test, type Page } from "@playwright/test";
import { apScenario as S } from "../src/domain/scenario-ap";

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const agentLines = (page: Page) => page.locator(".line.agent");

async function start(page: Page) {
  await page.goto("/?fast=1&sim=1");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/?fast=1&sim=1");
  await page.getByTestId("mode-sim").click();
  await page.getByTestId("start-capture").click();
  await expect(agentLines(page)).toHaveCount(1);
}

/** Harbor is routine; move to Brightline and make the decision that breaks the manual. */
async function breakTheManual(page: Page) {
  await page.getByTestId("act-approve").click();
  await page.getByTestId("next-invoice").click();
  await page.getByTestId("tab-contract").click();
  await page.getByTestId("act-approve").click();
}

/** Break the manual, wait for Pip's question, then answer it like Maria would. */
async function askAndAnswer(page: Page) {
  await breakTheManual(page);
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "ask");
  await page.getByTestId("compose-input").fill(S.captureCases.find((c) => c.invoice.id === "INV-2041")!.expertSays);
  await page.getByTestId("compose-input").press("Enter");
}

const brightline = () => S.captureCases.find((c) => c.invoice.id === "INV-2041")!;

test("legible: Pip shows its stage, stays quiet on routine work, and says why it asked", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "observe");
  await expect(page.getByTestId("coach-line")).toContainText("Work this invoice the way you normally would");

  // Routine: Pip says nothing, and says that it said nothing.
  await page.getByTestId("act-approve").click();
  await page.getByTestId("next-invoice").click();
  await expect(page.getByTestId("coach-line")).toContainText("Routine");
  await expect(page.getByTestId("coach-line")).toContainText("stayed quiet");
  await expect(page.getByTestId("why")).toHaveCount(0);

  // Deviation: Pip asks, and shows the evidence.
  await page.getByTestId("tab-contract").click();
  await page.getByTestId("act-approve").click();
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "ask");
  const why = page.getByTestId("why");
  await expect(why).toContainText("You chose Approve. The written procedure says Hold.");
  await expect(why).toContainText("You opened Contract notes");
  await shot(page, "10-why-pip-asked");

  // Answer: Pip writes the rule down and moves to Verify.
  await page.getByTestId("compose-input").fill(brightline().expertSays);
  await page.getByTestId("compose-input").press("Enter");
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "verify");
  await expect(page.getByTestId("coach-line")).toContainText("Confirm or correct");
  await shot(page, "11-verify");

  // Read-back confirmed: back to Observe, with the outcome stated.
  await page.getByTestId("compose-input").fill("Yes, exactly.");
  await page.getByTestId("compose-input").press("Enter");
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "observe");
  await expect(page.getByTestId("coach-line")).toContainText("Captured and verified");
});

test("controllable: the expert can pause Pip, and Pip says it did not ask", async ({ page }) => {
  await start(page);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("coach-line")).toContainText("Paused");

  await breakTheManual(page);
  await expect(page.getByTestId("skipped-count")).toHaveText("1");
  await expect(page.getByTestId("asked-count")).toHaveText("0");
  await expect(agentLines(page)).toHaveCount(1); // only the greeting
  await expect(page.getByTestId("coach-line")).toContainText("paused");

  await page.getByTestId("pause").click();
  await expect(page.getByTestId("coach-line")).toContainText("Resumed");
});

test("controllable: 'Not now' drops the question and records nothing", async ({ page }) => {
  await start(page);
  await breakTheManual(page);
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "ask");
  await expect(agentLines(page)).toHaveCount(2);

  await page.getByTestId("skip-topic").click();
  await expect(page.getByTestId("skipped-count")).toHaveText("1");
  await expect(page.getByTestId("coach")).toHaveAttribute("data-stage", "observe");
  await expect(page.getByTestId("coach-line")).toContainText("Skipped");
  await expect(page.getByTestId("insight")).toHaveCount(0);
  // Pip acknowledges, rather than recording the refusal as knowledge.
  await expect(page.locator(".line.agent").last()).toContainText("Moving on");
});

test("human-in-the-loop: a rule can be confirmed or discarded by hand, and the choice reaches the map", async ({ page }) => {
  await start(page);
  await askAndAnswer(page);
  const card = page.getByTestId("insight");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Waiting for Maria to confirm");

  // Confirm by hand, without waiting for the read-back.
  await page.getByTestId("confirm-rule").click();
  await expect(card).toContainText("Verified by Maria");
  await expect(page.getByTestId("confirm-rule")).toHaveCount(0);
  await expect(page.getByTestId("rule-count")).toContainText("1 rule · 1 verified");
  await shot(page, "12-confirmed");
});

test("human-in-the-loop: a wrong rule can be discarded and never reaches the tutor", async ({ page }) => {
  await start(page);
  await askAndAnswer(page);
  await expect(page.getByTestId("insight")).toHaveCount(1);

  await page.getByTestId("discard-rule").click();
  await expect(page.getByTestId("insight")).toHaveCount(0);
  await expect(page.getByTestId("coach-line")).toContainText("Discarded");
  await expect(page.getByTestId("rule-count")).toContainText("0 rules");
});

test("calm: nothing overlaps at laptop size, and the first screen is quiet", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await start(page);
  await shot(page, "13-calm-start");

  // The presenter notes no longer sit on top of the page content.
  await page.getByTestId("crib-toggle").click();
  const panel = page.getByRole("dialog", { name: "Demo crib sheet" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const sop = await page.locator("details.sop").boundingBox();
  expect(box!.y + box!.height <= sop!.y || box!.x >= sop!.x + sop!.width || box!.y < 60 + 1).toBeTruthy();
  await page.getByTestId("crib-toggle").click();

  // An empty Work Map is a slim rail, not six paragraphs.
  const slim = await page.locator(".node.slim").count();
  expect(slim).toBe(6);

  // One status for Pip's state, not four.
  await expect(page.getByText("Pip is watching")).toHaveCount(0);

  // The newest rule is on screen without scrolling the page.
  await askAndAnswer(page);
  const card = page.getByTestId("insight");
  await expect(card).toHaveCount(1);
  const c = await card.boundingBox();
  expect(c!.y).toBeLessThan(720);
  await shot(page, "14-calm-insight");
});
