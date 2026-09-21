/**
 * Every way into the background, and whether it waits for initialisation.
 *
 * MV3 requires listeners in the first turn of the event loop, so the worker starts answering
 * before it has decided whether the session survives or loaded the keychain it would answer from.
 * Whether a given door must wait is a decision; the failure mode is not making it. A barrier was
 * added to the popup's door and the site's door was missed for a while, which is exactly the shape
 * of mistake a list cannot prevent but an enforced list can.
 *
 * So the doors are declared here. Adding one fails this test until it is declared, and declaring
 * it means answering the question — a call that skips the barrier reads a connected origin as
 * disconnected and an unlocked wallet as locked.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The files that own the boundary. Listeners registered anywhere else are a finding in itself. */
const BOUNDARY_FILES = ['src/entrypoints/background.ts', 'src/platform/proxy.ts'] as const;

const REGISTRATION =
  /chrome\.runtime\.onConnect\.addListener|chrome\.runtime\.onMessage\.addListener|MessageBus\.onMessage\('([^']+)'|webextBridgeOnMessage\('([^']+)'/g;

interface Door {
  /** Why it waits, or why it must not. */
  reason: string;
  gated: boolean;
}

/**
 * Every entry point, and the decision made about it.
 *
 * Exempt means the barrier would defeat the purpose: liveness and readiness probes exist to be
 * answerable *while* initialising, and gating one would either deadlock it or make it lie.
 */
const DOORS: Record<string, Door> = {
  "background.ts chrome.runtime.onMessage#1": {
    gated: false,
    reason: 'Liveness ping and content-script-ready signal. Answers nothing about ' +
      'wallet state, and the ping must respond while still initialising.',
  },
  "background.ts chrome.runtime.onConnect#1": {
    gated: false,
    reason: 'Port liveness ping only; proxy ports are handed off to proxy.ts.',
  },
  "background.ts webext-bridge-keep-alive": {
    gated: false,
    reason: 'Keep-alive. Waiting on initialisation would defeat what it is for.',
  },
  "background.ts startup-health-check": {
    gated: false,
    reason: 'Reports whether initialisation finished. Gating it would deadlock the question.',
  },
  "proxy.ts chrome.runtime.onConnect#1": {
    gated: true,
    reason: 'Dispatches trusted UI methods and the content bridge provider entry point after recovery.',
  },
};

/** Each registration found in a boundary file, with the source that follows it. */
function findDoors(file: string): { label: string; body: string }[] {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8');
  const name = file.split('/').pop()!;

  const found: { label: string; index: number }[] = [];
  const counts: Record<string, number> = {};

  for (const match of source.matchAll(REGISTRATION)) {
    const channel = match[1] ?? match[2];
    let label: string;
    if (channel) {
      label = `${name} ${channel}`;
    } else {
      const kind = match[0].replace('.addListener', '');
      counts[kind] = (counts[kind] ?? 0) + 1;
      label = `${name} ${kind}#${counts[kind]}`;
    }
    found.push({ label, index: match.index });
  }

  // A handler runs from its registration to the next one, which is close enough to read for a
  // call to the barrier and does not need a parser to be right about.
  return found.map((entry, i) => ({
    label: entry.label,
    body: source.slice(entry.index, found[i + 1]?.index ?? source.length),
  }));
}

const doors = BOUNDARY_FILES.flatMap(findDoors);

describe('background entry points', () => {
  it('are all declared', () => {
    const undeclared = doors.map((d) => d.label).filter((label) => !(label in DOORS));

    // A new way in has appeared. Decide whether it must wait for initialisation, then add it to
    // DOORS with the reason — see this file's header for what goes wrong when it does not.
    expect(undeclared).toEqual([]);
  });

  it('are all still there, so the list cannot rot', () => {
    const live = new Set(doors.map((d) => d.label));
    expect(Object.keys(DOORS).filter((label) => !live.has(label))).toEqual([]);
  });

  it('wait for initialisation where they were declared to', () => {
    const ungated = doors
      .filter((d) => DOORS[d.label]?.gated)
      .filter((d) => !d.body.includes('whenServicesReady'))
      .map((d) => d.label);

    expect(ungated).toEqual([]);
  });

  it('says why for every door', () => {
    for (const [label, door] of Object.entries(DOORS)) {
      expect(door.reason.length, `${label} needs a reason`).toBeGreaterThan(20);
    }
  });
});
