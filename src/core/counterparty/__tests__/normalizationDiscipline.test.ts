import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NORMALIZATION_CONFIG } from '../normalize';

/**
 * Every compose form's quantities reach the node in base units.
 *
 * `normalizeFormData` is the one place display units become base units, and it is driven entirely
 * by a table. Every way that table can be incomplete fails the same way: the form's figure goes to
 * the node untouched, so a quantity arrives 1e8 too small, and it arrives *valid* — core accepts
 * it, the packer packs the same wrong number the form produced, and byte-equality verification
 * compares our wrong number against the node's wrong number and agrees.
 *
 * That is not hypothetical. A fairminter's `lot_price` shipped that way in 0.8.3: a sale meant to
 * raise 690 XCP would have sold its entire public allocation for 0.0000069 XCP. `pool_quantity`
 * was the same defect in the same release — 31,000,000 tokens reserved as 0.31. Both were one
 * missing line in the table, and nothing downstream could notice.
 *
 * So the table is checked for the three ways it can be silently incomplete, rather than each
 * compose form being driven end-to-end:
 *
 *   1. a compose type the app uses but the table does not declare — the whole form passes through;
 *   2. a quantity field with no asset to take divisibility from — that one field passes through;
 *   3. an asset field no form actually submits — same as (2), but only visible in the markup.
 *
 * (3) is what hid `lot_price`. It was added to the table pointing at `lot_price_asset`, a hidden
 * field carrying the constant 'XCP', and the field was not rendered — so the lookup found nothing
 * and the loop moved on. The table looked complete.
 *
 * Written as a test rather than a linter for the reason given in `numericDiscipline.test.ts`: it
 * is a rule about how two files have to agree, which is not a shape a linter can see.
 */

const SRC = join(__dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const APP_SOURCE = sourceFiles(SRC)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/**
 * The compose types the app actually asks for, read from the `composeType` every compose page
 * hands to `Composer`. Reading them from the pages rather than listing them here is the point: a
 * new compose page brings its own string, and the table has to grow to meet it.
 */
function composeTypesInUse(): string[] {
  const found = new Set<string>();
  for (const match of APP_SOURCE.matchAll(/composeType[=:]\s*["']([a-z]+)["']/g)) {
    found.add(match[1]!);
  }
  return [...found].sort();
}

/** A form field is submitted if some form renders an input under that name. */
const isSubmitted = (field: string) => APP_SOURCE.includes(`name="${field}"`);

describe('every compose form normalizes its quantities', () => {
  const inUse = composeTypesInUse();

  it('finds the compose pages', () => {
    expect(inUse.length).toBeGreaterThan(15);
    expect(inUse).toContain('send');
    expect(inUse).toContain('fairminter');
  });

  it('declares every compose type the app uses', () => {
    // `burn` is the exception, and it is one in `composer-context` too: it sends bitcoin to the
    // burn address and carries no Counterparty message, so there is nothing to scale or verify.
    const undeclared = inUse.filter((type) => type !== 'burn' && !(type in NORMALIZATION_CONFIG));

    expect(undeclared).toEqual([]);
  });

  it('gives every quantity field an asset to take divisibility from', () => {
    const orphans: string[] = [];
    for (const [type, config] of Object.entries(NORMALIZATION_CONFIG)) {
      for (const quantity of config.quantityFields) {
        if (!config.assetFields[quantity]) orphans.push(`${type}.${quantity}`);
      }
    }

    expect(orphans).toEqual([]);
  });

  it('points every asset field at one a form submits', () => {
    const missing: string[] = [];
    for (const [type, config] of Object.entries(NORMALIZATION_CONFIG)) {
      for (const [quantity, assetField] of Object.entries(config.assetFields)) {
        if (!isSubmitted(assetField)) missing.push(`${type}.${quantity} -> ${assetField}`);
      }
    }

    expect(missing).toEqual([]);
  });

  // The checks above read source text, so it is worth knowing they still react to what they hunt.
  it('would catch a new one', () => {
    expect(isSubmitted('lot_price_asset')).toBe(true);
    expect(isSubmitted('a_field_no_form_renders')).toBe(false);

    const parsed = [...'composeType="send" composeType: \'fairminter\''.matchAll(
      /composeType[=:]\s*["']([a-z]+)["']/g
    )].map((match) => match[1]);
    expect(parsed).toEqual(['send', 'fairminter']);
  });
});
