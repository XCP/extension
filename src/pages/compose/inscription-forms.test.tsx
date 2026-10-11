import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFormValues } from '@/components/composer/form-values';
import { MAX_INSCRIPTION_FILE_BYTES } from '@/core/counterparty/compose';
import type { InscriptionUploadDraft } from '@/hooks/useInscriptionUpload';
import { BroadcastForm } from './broadcast/form';
import { FairminterForm } from './fairminter/form';
import { IssuanceForm } from './issuance/form';
import { UpdateDescriptionForm } from './issuance/update-description/form';

vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({
    activeAddress: { address: 'bc1qqh8stj46mp3xpk6lxn78qw6cmr3ljrxjmjq4kr' },
    activeWallet: { type: 'mnemonic', name: 'Test' },
    showHelpText: false,
  }),
}));
vi.mock('@/hooks/useAssetDetails', () => ({ useAssetDetails: () => ({ data: null }) }));
vi.mock('@/hooks/useAssetInfo', () => ({
  useAssetInfo: () => ({
    isLoading: false, error: null,
    data: { asset: 'TOKEN', divisible: true, supply: '0', supply_normalized: '0' },
  }),
}));
vi.mock('@/components/domain/address/address-header', () => ({ AddressHeader: () => null }));
vi.mock('@/components/domain/asset/asset-header', () => ({ AssetHeader: () => null }));
vi.mock('@/components/domain/asset/asset-name-input', () => ({
  AssetNameInput: ({ onValidationChange, value, name }: {
    onValidationChange: (valid: boolean) => void; value: string; name: string;
  }) => {
    useEffect(() => { onValidationChange(true); }, [onValidationChange]);
    return <input type="hidden" name={name} value={value} readOnly />;
  },
}));
vi.mock('@/components/domain/balance/amount-with-max-input', () => ({ AmountWithMaxInput: () => null }));
vi.mock('@/components/ui/inputs/block-height-input', () => ({ BlockHeightInput: () => null }));
vi.mock('@/components/composer/composer-form', () => ({
  ComposerForm: ({ children, formAction, submitDisabled }: {
    children: ReactNode;
    formAction: (data: FormData) => void;
    submitDisabled?: boolean;
  }) => <form onSubmit={event => {
    event.preventDefault();
    formAction(new FormData(event.currentTarget));
  }}>
    {children}
    <button type="submit" disabled={submitDisabled}>Continue</button>
  </form>,
}));

const uploadForms = [
  { name: 'issuance', field: 'description', render: (submit: (form: FormData) => void, draft: InscriptionUploadDraft | null) =>
    <IssuanceForm formAction={submit} initialFormData={{ asset: 'TOKEN', quantity: '1', ...draft }} /> },
  { name: 'update description', field: 'description', render: (submit: (form: FormData) => void, draft: InscriptionUploadDraft | null) =>
    <UpdateDescriptionForm formAction={submit} initialFormData={draft} asset="TOKEN" /> },
  { name: 'broadcast', field: 'text', render: (submit: (form: FormData) => void, draft: InscriptionUploadDraft | null) =>
    <BroadcastForm formAction={submit} initialFormData={draft} /> },
] as const;

describe.each(uploadForms)('$name inscription', ({ field, render: form }) => {
  function upload(container: HTMLElement, file: File) {
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  }

  it.each([
    { type: 'text/plain', name: 'message.txt', bytes: new TextEncoder().encode('hello inscription'), content: 'hello inscription' },
    { type: 'image/png', name: 'image.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0xff]), content: '89504e4700ff' },
  ])('preserves $type content and filename through review and Back', async ({ type, name, bytes, content }) => {
    const submit = vi.fn();
    const first = render(form(submit, null));
    fireEvent.click(screen.getByRole('switch'));
    upload(first.container, new File([bytes], name, { type }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    const submitted: FormData = submit.mock.calls[0]![0];
    expect(Object.fromEntries(submitted)).toMatchObject({
      [field]: content, inscription: 'true', mime_type: type, encoding: 'taproot', inscription_file_name: name,
    });
    const draft = readFormValues<InscriptionUploadDraft>(submitted);
    first.unmount();
    const resubmit = vi.fn();
    render(form(resubmit, draft));
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText(name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(resubmit).toHaveBeenCalledOnce());
    expect(Object.fromEntries(resubmit.mock.calls[0]![0])).toEqual(Object.fromEntries(submitted));
  });

  it('removes a restored file and uses its replacement', async () => {
    const submit = vi.fn();
    const view = render(form(submit, {
      [field]: '89504e47', inscription: 'true', mime_type: 'image/png', inscription_file_name: 'old.png',
    }));
    fireEvent.click(screen.getByRole('button', { name: /remove file/i }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    upload(view.container, new File(['replacement'], 'new.txt', { type: 'text/plain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(Object.fromEntries(submit.mock.calls[0]![0])).toMatchObject({
      [field]: 'replacement', inscription_file_name: 'new.txt', mime_type: 'text/plain',
    });
  });

  it('switches back to ordinary text without submitting old inscription metadata', async () => {
    const submit = vi.fn();
    render(form(submit, { [field]: '89504e47', inscription: 'true', mime_type: 'image/png' }));
    fireEvent.click(screen.getByRole('switch'));
    const text = screen.getByRole('textbox');
    expect(text).toHaveValue('');
    fireEvent.change(text, { target: { value: 'ordinary text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    const submitted: FormData = submit.mock.calls[0]![0];
    expect(submitted.get(field)).toBe('ordinary text');
    for (const key of ['inscription', 'mime_type', 'encoding', 'inscription_file_name']) expect(submitted.has(key)).toBe(false);
  });

  it('rejects oversized replacements without retaining a stale file', () => {
    const view = render(form(vi.fn(), { [field]: 'old', inscription: 'true', mime_type: 'text/plain' }));
    const oversized = new File(['too large'], 'large.bin');
    Object.defineProperty(oversized, 'size', { value: MAX_INSCRIPTION_FILE_BYTES + 1 });
    upload(view.container, oversized);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('does not submit when the selected file cannot be read', async () => {
    const submit = vi.fn();
    const view = render(form(submit, null));
    fireEvent.click(screen.getByRole('switch'));
    const unreadable = new File(['content'], 'unreadable.txt', { type: 'text/plain' });
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('read failed'));
    upload(view.container, unreadable);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('alert');
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('fairminter inscription', () => {
  it('keeps fairminter inscription text in description and sends a boolean inscription flag', () => {
    const submit = vi.fn();
    render(<FairminterForm formAction={submit} asset="TOKEN" initialFormData={{
      asset: 'TOKEN', description: 'hello inscription', burn_payment: false, max_mint_per_tx: '1',
    }} />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(submit).toHaveBeenCalledOnce();
    const form: FormData = submit.mock.calls[0]![0];
    expect(Object.fromEntries(form)).toMatchObject({
      description: 'hello inscription', inscription: 'true', mime_type: 'text/plain', encoding: 'taproot',
    });
  });

  it('restores inscription mode and can switch back to a plain description', () => {
    const submit = vi.fn();
    render(<FairminterForm formAction={submit} asset="TOKEN" initialFormData={{
      asset: 'TOKEN', description: 'hello inscription', inscription: 'true', mime_type: 'text/plain',
      encoding: 'taproot', burn_payment: false, max_mint_per_tx: '1',
    }} />);
    expect(screen.getByRole('switch')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(Object.fromEntries(submit.mock.calls[0]![0])).toMatchObject({
      description: 'hello inscription', inscription: 'true', mime_type: 'text/plain', encoding: 'taproot',
    });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const ordinary: FormData = submit.mock.calls[1]![0];
    expect(ordinary.get('description')).toBe('hello inscription');
    for (const key of ['inscription', 'mime_type', 'encoding']) expect(ordinary.has(key)).toBe(false);
  });
});
