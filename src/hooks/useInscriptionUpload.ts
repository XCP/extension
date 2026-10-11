import { hexToBytes } from '@noble/hashes/utils.js';
import { useState } from 'react';
import { formBoolean } from '@/components/composer/form-values';
import { MAX_INSCRIPTION_FILE_BYTES } from '@/core/counterparty/compose';
import { encodeInscriptionContent, isTextualMimeType } from '@/core/counterparty/inscriptionEnvelope';
import { t } from '@/i18n';

export interface InscriptionUploadDraft {
  inscription?: string;
  mime_type?: string;
  description?: string;
  text?: string;
  inscription_file_name?: string;
}

function restoreFile(draft: InscriptionUploadDraft | null, field: 'description' | 'text'): File | null {
  if (!formBoolean(draft?.inscription) || draft?.[field] === undefined || !draft.mime_type) return null;
  try {
    const content = draft[field];
    const bytes = isTextualMimeType(draft.mime_type) ? new TextEncoder().encode(content) : hexToBytes(content);
    if (bytes.length > MAX_INSCRIPTION_FILE_BYTES) return null;
    return new File([bytes], draft.inscription_file_name || 'inscription', { type: draft.mime_type });
  } catch {
    return null;
  }
}

export function useInscriptionUpload(draft: InscriptionUploadDraft | null, field: 'description' | 'text') {
  const [enabled, setEnabled] = useState(formBoolean(draft?.inscription) ?? false);
  const [file, setFile] = useState(() => restoreFile(draft, field));
  const [error, setError] = useState<string | null>(null);

  function onFileChange(next: File | null) {
    setError(null);
    if (next && next.size > MAX_INSCRIPTION_FILE_BYTES) {
      setFile(null);
      setError(t('issuance_form_file_size_must_be_less', [String(MAX_INSCRIPTION_FILE_BYTES / 1024)]));
      return;
    }
    setFile(next);
  }

  async function prepareFormData(form: FormData): Promise<boolean> {
    for (const key of ['inscription', 'mime_type', 'encoding', 'inscription_file_name']) form.delete(key);
    if (!enabled) return true;
    if (!file) return false;
    try {
      const mimeType = file.type || 'application/octet-stream';
      const bytes = new Uint8Array(await file.arrayBuffer());
      form.set(field, encodeInscriptionContent(bytes, mimeType));
      form.set('inscription', 'true');
      form.set('mime_type', mimeType);
      form.set('encoding', 'taproot');
      // Draft-only metadata; compose APIs select their own request fields.
      form.set('inscription_file_name', file.name);
      return true;
    } catch {
      setError(t('common_failed_to_process_file'));
      return false;
    }
  }

  return { enabled, setEnabled, file, error, onFileChange, prepareFormData };
}
