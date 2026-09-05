import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Capture the initial decision separately from the taller, expanded evidence gallery. */
export async function captureApprovalSizes(page: Page, directory: string, name: string) {
  const content = page.getByTestId('approval-content');
  const footer = page.getByTestId('approval-footer');
  for (const width of [350, 380]) {
    await page.setViewportSize({ width, height: 600 });
    await content.evaluate(element => { element.scrollTop = 0; });
    expect(await content.evaluate(element => element.scrollWidth <= element.clientWidth),
      `${name}: approval overflows at ${width}px`).toBe(true);
    const notice = content.getByTestId('approval-notice');
    if (/(caution|warning|blocked)/.test(name) || await page.getByRole('button', { name: /^Review$/ }).count()) {
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
