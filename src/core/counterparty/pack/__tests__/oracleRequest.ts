/** Retry the transient failures a live nightly oracle can encounter without hiding real errors. */
export async function fetchOracle(url: string): Promise<Response> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const retryable = response.status === 429 || response.status >= 500;
      if (response.ok || !retryable || attempt === attempts - 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }

    // Keep the whole request comfortably inside each oracle case's 30-second timeout.
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }

  throw lastError ?? new Error('oracle request failed without a response');
}
