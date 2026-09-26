import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/**
 * Every rendered approval fact label must sit on one line at this width.
 *
 * The label budget in scripts/i18n.mjs keeps catalog strings short; this checks the rendered
 * result, in whatever locale the gallery runs, including labels built from data.
 */
export async function assertFactLabelsFit(page: Page, name: string, width: number) {
  const wrapped = await page.locator('[data-fact-label]').evaluateAll(labels => labels.flatMap(label => {
    const range = document.createRange();
    range.selectNodeContents(label);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
    const lines = new Set(rects.map(rect => Math.round(rect.top))).size;
    return lines > 1 ? [label.textContent ?? ''] : [];
  }));
  expect(wrapped, `${name}: fact labels wrap at ${width}px`).toEqual([]);
}

/**
 * The whole approval at one width, with the scroll container unrolled so nothing below the fold is
 * cut off. The regular full-page capture stops at the popup's 600px content box.
 */
export async function captureExpanded(page: Page, file: string, width = 350) {
  const previous = page.viewportSize();
  await page.setViewportSize({ width, height: 600 });
  const content = page.getByTestId('approval-content');
  await content.evaluate(element => {
    for (let node: HTMLElement | SVGElement | null = element; node; node = node.parentElement) {
      node.dataset.galleryStyle = node.getAttribute('style') ?? '';
      node.style.setProperty('height', 'auto', 'important');
      node.style.setProperty('max-height', 'none', 'important');
      node.style.setProperty('overflow', 'visible', 'important');
    }
    element.style.setProperty('flex', 'none', 'important');
  });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await assertFactLabelsFit(page, path.basename(file), width);
  await page.screenshot({ path: file, fullPage: true });
  await content.evaluate(element => {
    for (let node: HTMLElement | SVGElement | null = element; node; node = node.parentElement) {
      const style = node.dataset.galleryStyle ?? '';
      if (style) node.setAttribute('style', style); else node.removeAttribute('style');
      delete node.dataset.galleryStyle;
    }
  });
  if (previous) await page.setViewportSize(previous);
}

/** Capture the initial decision separately from the taller, expanded evidence gallery. */
export async function captureApprovalSizes(page: Page, directory: string, name: string, reviewLabel = 'Review') {
  const content = page.getByTestId('approval-content');
  const footer = page.getByTestId('approval-footer');
  const sidepanel = new URL(page.url()).pathname === '/sidepanel.html';
  for (const width of sidepanel ? [350, 380, 520] : [350, 380]) {
    await page.setViewportSize({ width, height: 600 });
    await content.evaluate(async element => {
      // Focus and a viewport change can scroll an outer shell as well as the decision area.
      for (let parent: Element | null = element; parent; parent = parent.parentElement) parent.scrollTop = 0;
      window.scrollTo(0, 0);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    expect(await content.evaluate(element => element.scrollWidth <= element.clientWidth),
      `${name}: approval overflows at ${width}px`).toBe(true);
    await assertFactLabelsFit(page, name, width);
    const notice = content.getByTestId('approval-notice');
    if (/(caution|warning|blocked)/.test(name) || await page.getByRole('button', { name: reviewLabel, exact: true }).count()) {
      await expect(notice.first(), `${name}: the exception must be visible before approval`).toBeInViewport({ ratio: 1 });
    }
    if (name.startsWith('bundle-attach-and-list')) {
      await expect(content.getByText('Your payout if sold', { exact: true }).locator('..')).toBeInViewport({ ratio: 1 });
      const action = footer.getByRole('button', { name: 'Attach and list' });
      const height = await action.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        return { text: range.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight) };
      });
      expect(height.text, `${name}: action should fit on one line at default text size`).toBeLessThanOrEqual(height.line + 1);
    }
    if (name === 'checkout-buy-proved') {
      await expect(content.getByText('You pay', { exact: true }).locator('..')).toBeInViewport({ ratio: 1 });
    }
    const outcome = /^offer-authorize(-|$)/.test(name) ? 'You pay if accepted'
      : /^(offer-accept-|bundle-accept-cpfp-)/.test(name) ? 'You receive' : null;
    if (outcome) {
      await expect(content.getByText(outcome, { exact: true }).first().locator('..'),
        `${name}: the signer outcome must be above the fold`).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: path.join(directory, `${name}-initial-${width}.png`) });
  }
  if (['listing-create-proved', 'bitcoin-pay-proved', 'bitcoin-pay-mismatch-blocked', 'bundle-accept-cpfp-proved', 'connect-proved', 'message-proved'].includes(name)) {
    await page.setViewportSize({ width: 350, height: 600 });
    for (const [variant, css] of [
      ['large-text', 'html { font-size: 200% !important; }'],
      ['text-spacing', '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }'],
    ]) {
      const style = await page.addStyleTag({ content: css! });
      try {
        expect(await content.evaluate(element => element.scrollWidth <= element.clientWidth),
          `${name}: content overflows with ${variant}`).toBe(true);
        expect(await footer.evaluate(element => element.scrollWidth <= element.clientWidth),
          `${name}: footer overflows with ${variant}`).toBe(true);
        const contentBox = await content.boundingBox();
        const footerBox = await footer.boundingBox();
        expect(contentBox!.height).toBeGreaterThan(0);
        expect(contentBox!.y + contentBox!.height).toBeLessThanOrEqual(footerBox!.y + 1);
        expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(601);
        await page.screenshot({ path: path.join(directory, `${name}-${variant}.png`) });
      } finally {
        await style.evaluate(element => { element.parentNode?.removeChild(element); });
      }
    }
  }
  await page.setViewportSize({ width: 380, height: 1400 });
}
