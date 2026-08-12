import { describe, expect, it } from 'vitest';
import {
  type AddressEvent,
  detectFromEvents,
  MAX_NOTIFICATIONS_PER_POLL,
  type NotificationState,
} from '../detect';

const MINE = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const THEIRS = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
const watched = new Set([MINE]);

const dispense = (event_index: number, params: Record<string, unknown> = {}): AddressEvent => ({
  event_index,
  event: 'DISPENSE',
  params: {
    asset: 'RAREPEPE',
    dispense_quantity_normalized: '1',
    source: MINE,
    destination: THEIRS,
    tx_hash: `hash${event_index}`,
    ...params,
  },
});

const orderMatch = (event_index: number, params: Record<string, unknown> = {}): AddressEvent => ({
  event_index,
  event: 'ORDER_MATCH',
  params: { forward_asset: 'XCP', backward_asset: 'BTC', tx_hash: `hash${event_index}`, ...params },
});

describe('detectFromEvents', () => {
  // The rule deciding whether switching this on is pleasant or a wall of alerts about things that
  // happened months ago.
  it('says nothing on the first poll, but records the position', () => {
    const result = detectFromEvents([dispense(10), dispense(9)], {}, watched);

    expect(result.notifications).toEqual([]);
    expect(result.state.lastEventIndex).toBe(10);
  });

  it('announces only what is above the watermark', () => {
    const result = detectFromEvents(
      [dispense(12), dispense(11), dispense(10)],
      { lastEventIndex: 10 },
      watched
    );

    expect(result.notifications.map((n) => n.id)).toEqual(['DISPENSE:12', 'DISPENSE:11']);
    expect(result.state.lastEventIndex).toBe(12);
  });

  it('stays quiet when nothing has moved', () => {
    const result = detectFromEvents([dispense(10)], { lastEventIndex: 10 }, watched);
    expect(result.notifications).toEqual([]);
  });

  // Two polls racing, or a poll re-run after the worker restarts, must not report one sale twice.
  it('does not repeat itself when the same page is read again', () => {
    const first = detectFromEvents([dispense(11), dispense(10)], { lastEventIndex: 10 }, watched);
    const second = detectFromEvents([dispense(11), dispense(10)], first.state, watched);

    expect(first.notifications).toHaveLength(1);
    expect(second.notifications).toEqual([]);
  });

  // A dispense names both sides. Getting the direction wrong would tell a buyer their dispenser
  // sold something they in fact just bought.
  it('reads a dispense from our own dispenser as a sale', () => {
    const result = detectFromEvents([dispense(11)], { lastEventIndex: 10 }, watched);

    expect(result.notifications[0]!.title).toBe('Dispenser sold');
    expect(result.notifications[0]!.message).toBe('1 RAREPEPE dispensed');
  });

  it('reads a dispense paid to us as a purchase', () => {
    const result = detectFromEvents(
      [dispense(11, { source: THEIRS, destination: MINE })],
      { lastEventIndex: 10 },
      watched
    );

    expect(result.notifications[0]!.title).toBe('Dispense received');
    expect(result.notifications[0]!.message).toBe('1 RAREPEPE received');
  });

  it('ignores a dispense between two strangers', () => {
    const result = detectFromEvents(
      [dispense(11, { source: THEIRS, destination: THEIRS })],
      { lastEventIndex: 10 },
      watched
    );

    expect(result.notifications).toEqual([]);
    // Still consumed: it has been considered, and re-reading it would only re-skip it.
    expect(result.state.lastEventIndex).toBe(11);
  });

  it('describes an order match by its pair', () => {
    const result = detectFromEvents([orderMatch(11)], { lastEventIndex: 10 }, watched);

    expect(result.notifications[0]!.title).toBe('Order matched');
    expect(result.notifications[0]!.message).toBe('XCP for BTC');
  });

  // An amount we cannot read has no correct rendering, so the message drops it rather than
  // inventing a number or printing "undefined".
  it('omits the amount when the event does not carry one', () => {
    const result = detectFromEvents(
      [dispense(11, { dispense_quantity_normalized: undefined })],
      { lastEventIndex: 10 },
      watched
    );

    expect(result.notifications[0]!.message).toBe('RAREPEPE dispensed');
  });

  it('ignores event types it was not taught', () => {
    const result = detectFromEvents(
      [{ event_index: 11, event: 'SOMETHING_NEW', params: {} }],
      { lastEventIndex: 10 },
      watched
    );

    expect(result.notifications).toEqual([]);
    expect(result.state.lastEventIndex).toBe(11);
  });

  // A wallet closed over a busy weekend should get a handful and a summary, not ninety alerts.
  it('caps a burst and reports how many it held back', () => {
    const events = Array.from({ length: 9 }, (_, i) => dispense(20 - i));
    const result = detectFromEvents(events, { lastEventIndex: 10 }, watched);

    expect(result.notifications).toHaveLength(MAX_NOTIFICATIONS_PER_POLL);
    expect(result.suppressed).toBe(9 - MAX_NOTIFICATIONS_PER_POLL);
    // The watermark still clears the whole page, so the held-back ones are not re-offered.
    expect(result.state.lastEventIndex).toBe(20);
  });

  it('routes a notification at the transaction it came from', () => {
    const result = detectFromEvents([dispense(11)], { lastEventIndex: 10 }, watched);
    expect(result.notifications[0]!.route).toBe('/transactions/hash11');
  });

  it('leaves state untouched when there is nothing to read', () => {
    const state: NotificationState = { lastEventIndex: 7 };
    expect(detectFromEvents([], state, watched).state).toBe(state);
  });
});
