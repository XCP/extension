import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUploadInput, CSVUploadInput, InscriptionUploadInput } from '../file-upload-input';

describe('FileUploadInput', () => {
  const mockOnFileChange = vi.fn();

  beforeEach(() => {
    mockOnFileChange.mockClear();
  });

  it('renders with label and required indicator', () => {
    render(
      <FileUploadInput
        label="Upload File"
        required={true}
        selectedFile={null}
        onFileChange={mockOnFileChange}
      />
    );
    
    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows upload button when no file selected', () => {
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={null}
        onFileChange={mockOnFileChange}
        uploadButtonText="Choose File"
      />
    );
    
    expect(screen.getByText('Choose File')).toBeInTheDocument();
  });

  it('shows selected file info when file is selected', () => {
    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(mockFile, 'size', { value: 1024 });
    
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={mockFile}
        onFileChange={mockOnFileChange}
      />
    );
    
    expect(screen.getByText('test.txt')).toBeInTheDocument();
    // The text includes the file type, so we need to check for partial text
    expect(screen.getByText(/Size: 1\.00 KB/)).toBeInTheDocument();
    expect(screen.getByText('Remove file')).toBeInTheDocument();
  });

  it('calls onFileChange when file is selected', async () => {
    const { rerender } = render(
      <FileUploadInput
        label="Upload File"
        selectedFile={null}
        onFileChange={mockOnFileChange}
      />
    );

    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    // Mock file input change
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    
    fireEvent.change(input);
    
    await waitFor(() => {
      expect(mockOnFileChange).toHaveBeenCalledWith(file);
    });
  });

  it('validates file size', async () => {
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={null}
        onFileChange={mockOnFileChange}
        maxSizeKB={1}
      />
    );

    const file = new File(['x'.repeat(2048)], 'large.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 2048 });
    
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    
    fireEvent.change(input);
    
    await waitFor(() => {
      expect(mockOnFileChange).toHaveBeenCalledWith(null);
    });
  });

  it('handles file removal', async () => {
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={mockFile}
        onFileChange={mockOnFileChange}
      />
    );
    
    const removeButton = screen.getByText('Remove file');
    await userEvent.click(removeButton);
    
    expect(mockOnFileChange).toHaveBeenCalledWith(null);
  });

  it('shows error message when provided', () => {
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={null}
        onFileChange={mockOnFileChange}
        error="File too large"
      />
    );
    
    expect(screen.getByText('File too large')).toBeInTheDocument();
  });

  it('shows help text when enabled', () => {
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={null}
        onFileChange={mockOnFileChange}
        helpText="Select a file to upload"
        showHelpText={true}
      />
    );
    
    expect(screen.getByText('Select a file to upload')).toBeInTheDocument();
  });

  it('disables input when disabled prop is true', () => {
    render(
      <FileUploadInput
        label="Upload File"
        selectedFile={null}
        onFileChange={mockOnFileChange}
        disabled={true}
      />
    );
    
    const button = screen.getByText('Choose File');
    expect(button).toHaveClass('disabled:opacity-50');
  });
});

describe('CSVUploadInput', () => {
  const mockOnFileChange = vi.fn();

  it('renders with CSV-specific props', () => {
    render(
      <CSVUploadInput
        label="Upload CSV"
        selectedFile={null}
        onFileChange={mockOnFileChange}
      />
    );
    
    // There are multiple elements with 'Upload CSV' text (label and button), so be more specific
    expect(screen.getByRole('button', { name: /Upload CSV/i })).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.csv');
  });

  it('uses custom upload button text', () => {
    render(
      <CSVUploadInput
        label="Upload Data"
        selectedFile={null}
        onFileChange={mockOnFileChange}
        uploadButtonText="Select CSV"
      />
    );
    
    expect(screen.getByText('Select CSV')).toBeInTheDocument();
  });
});

describe('InscriptionUploadInput', () => {
  const mockOnFileChange = vi.fn();

  it('renders with default inscription label', () => {
    render(
      <InscriptionUploadInput
        selectedFile={null}
        onFileChange={mockOnFileChange}
      />
    );
    
    expect(screen.getByText('Inscription')).toBeInTheDocument();
  });

  it('uses custom label when provided', () => {
    render(
      <InscriptionUploadInput
        label="Custom Inscription"
        selectedFile={null}
        onFileChange={mockOnFileChange}
      />
    );
    
    expect(screen.getByText('Custom Inscription')).toBeInTheDocument();
  });

  it('uses custom upload button text', () => {
    render(
      <InscriptionUploadInput
        selectedFile={null}
        onFileChange={mockOnFileChange}
        uploadButtonText="Select Inscription"
      />
    );
    
    expect(screen.getByText('Select Inscription')).toBeInTheDocument();
  });
});