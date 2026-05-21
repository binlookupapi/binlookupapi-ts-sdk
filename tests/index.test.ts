import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BINLookupClient, BINLookupAPIError } from '../src/index';

// Stub the global fetch so tests never hit the real network.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Returns a minimal fetch Response-like object. */
function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  };
}

const client = new BINLookupClient({ apiKey: 'test-key', maxRetries: 0 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BIN validation (no network)', () => {
  it('throws BAD_REQUEST for a BIN that is too short', async () => {
    // Numbers below 1000 are less than 4 digits — invalid before we even call the API.
    await expect(client.lookup(999)).rejects.toThrow(BINLookupAPIError);
    await expect(client.lookup(999)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST for a BIN that is too long', async () => {
    await expect(client.lookup(999999999)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST for a non-numeric string', async () => {
    await expect(client.lookup('abcd')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts a valid 6-digit BIN as string', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: {} }, {
      'X-Quota-Limit': '100',
      'X-Quota-Remaining': '99',
      'X-Quota-Reset': '1700000000',
    }));
    const result = await client.lookup('424671');
    expect(result.data).toBeDefined();
  });
});

describe('Successful response', () => {
  it('returns BINData and parsed quota headers', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: { bin: '424671', scheme: 'visa' } }, {
      'X-Quota-Limit': '1000',
      'X-Quota-Remaining': '950',
      'X-Quota-Reset': '1700000000',
    }));

    const result = await client.lookup(424671);
    expect(result.data.bin).toBe('424671');
    expect(result.quota).toEqual({ limit: 1000, remaining: 950, reset: 1700000000 });
  });
});

describe('Error handling', () => {
  it('throws BINLookupAPIError with correct code on a 401 response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: 'UNAUTHORIZED', message: 'Invalid API key' }));
    await expect(client.lookup(424671)).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });
  });

  it('handles non-JSON error bodies (e.g. HTML gateway errors) without crashing', async () => {
    // If the API returns a non-JSON body on error, our fallback kicks in and wraps it as SERVICE_ERROR.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      headers: { get: () => null },
    });

    const err = await client.lookup(424671).catch((e) => e);
    expect(err).toBeInstanceOf(BINLookupAPIError);
    expect(err.code).toBe('SERVICE_ERROR');
  });
});

describe('Request headers', () => {
  it('sends the correct User-Agent header on every request', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: {} }, {
      'X-Quota-Limit': '100',
      'X-Quota-Remaining': '99',
      'X-Quota-Reset': '1700000000',
    }));

    await client.lookup(424671);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['User-Agent']).toBe('binlookupapi-ts-sdk/1.0.2');
  });
});

describe('Timeout', () => {
  it('rejects with an error if the request exceeds the configured timeout', async () => {
    // The client aborts via AbortController; fetch throws an AbortError.
    mockFetch.mockImplementationOnce(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), 50)
      )
    );

    // 1ms timeout guarantees the abort fires before the 50ms mock delay.
    const fastClient = new BINLookupClient({ apiKey: 'test-key', maxRetries: 0, timeout: 1 });
    await expect(fastClient.lookup(424671)).rejects.toThrow();
  });
});
