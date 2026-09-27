/**
 * Message fields a compose function chose itself rather than taking from its caller's data.
 *
 * An attach that names its output after the change is the case (`composeAttach`): the form names
 * no output, so a message rebuilt from the form's data ends without one, while the message this
 * wallet asked Core for ends with it. Verification rebuilds the expected message from the form's
 * data plus these fields. They are keyed by the response object the compose function returned and
 * recorded when it built the request, so nothing a composer returns can supply or alter one.
 */

const chosenFields = new WeakMap<object, Readonly<Record<string, string>>>();

/** Record the message fields the wallet itself asked for when it composed `response`. */
export function recordComposerChoices(response: object, fields: Readonly<Record<string, string>>): void {
  chosenFields.set(response, { ...fields });
}

/** The message fields recorded for `response`, or none. */
export function composerChosenMessageFields(response: unknown): Readonly<Record<string, string>> {
  if (typeof response !== 'object' || response === null) return {};
  return chosenFields.get(response) ?? {};
}
