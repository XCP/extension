/**
 * Send an event to the background script's EventEmitterService.
 *
 * The popup and the background run separate instances of the emitter, so an approval screen cannot
 * resolve a dApp's pending request by emitting locally — the message has to cross.
 */

/**
 * @param event - the event name the background is waiting on, e.g. `sign-psbt-complete-<id>`
 * @param data - the payload delivered to the waiting request
 */
export function emitToBackground(event: string, data: unknown): void {
  chrome.runtime
    .sendMessage({
      type: 'COMPOSE_EVENT',
      event,
      data,
    })
    .catch((error) => {
      // The popup is usually closing at this point, which is not a failure worth surfacing.
      console.debug('Failed to emit sign event to background:', error);
    });
}
