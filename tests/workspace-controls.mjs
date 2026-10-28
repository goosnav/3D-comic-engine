// Control regression tests use the real navigation; workspace.browser.mjs tests the flow itself.
export async function inWorkspace(locator) {
  const page = locator.page();
  const location = await locator.evaluate(node => ({
    view: node.closest('[data-view]')?.dataset.view,
    step: node.closest('[data-step]')?.dataset.step,
  }));
  if (location.view && await page.locator(`[data-view="${location.view}"]`).isHidden()) {
    await page.locator(`[data-view-target="${location.view}"]`).click();
  }
  if (location.step && await locator.locator('xpath=ancestor::*[@data-step][1]').isHidden()) {
    await page.locator(`[data-step-target="${location.step}"]`).click();
  }
  const details = locator.locator('xpath=ancestor::details[not(@open)]');
  for (const detail of await details.all()) await detail.locator(':scope > summary').click();
  return locator;
}
