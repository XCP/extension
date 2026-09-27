import { ZELD_DISPLAY_NAME } from '@/core/zeld/api';

/**
 * Where ZELD stays with an asset, stated under the summary: facts the signer should know before
 * selling or moving that asset later, not a risk to confirm now. Nothing renders when the request
 * involves no ZELD.
 */
export function ApprovalZeldNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div data-testid="approval-zeld-notes" className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-medium text-gray-500 uppercase">{ZELD_DISPLAY_NAME}</h3>
      {notes.map((note, index) => (
        <p key={`zeld-note-${index}`} className={`text-sm leading-5 text-gray-700 ${index > 0 ? 'mt-2' : ''}`}>{note}</p>
      ))}
    </div>
  );
}
