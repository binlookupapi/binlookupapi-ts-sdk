/**
 * BINLookupAPI TypeScript SDK
 * * A production-ready client for interacting with the BINLookupAPI.
 * Features:
 * - Full TypeScript support for all request/response objects
 * - Custom error handling for API-specific error codes
 * - Built-in retry logic with exponential backoff
 * - Quota monitoring via response headers
 */

// --- Types & Interfaces ---

export type BINScheme = 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'unionpay' | 'diners' | 'unknown';
export type BINFunding = 'credit' | 'debit' | 'prepaid' | 'unknown';

export interface BINLookupRequest {
  /**
   * The first 4 to 8 digits of a payment card number.
   * Range: 1000 to 99999999.
   */
  number: number;
}

export interface BINCountry {
  code: string; // ISO 3166-1 alpha-2
  name: string;
}

export interface BINIssuer {
  name: string | null;
  website: string | null;
  phone: string | null;
}

export interface BINData {
  bin: string;
  scheme: BINScheme;
  funding: BINFunding;
  brand: string | null;
  category: string | null;
  country: BINCountry;
  issuer: BINIssuer;
  currency: string | null;
  prepaid: boolean;
  commercial: boolean;
}

export interface BINLookupResponse {
  data: BINData;
  /** Quota information extracted from response headers */
  quota?: {
    limit: number;
    remaining: number;
    reset: number; // Unix timestamp
  };
}

export type BINErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'PAYMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'SERVICE_ERROR';

export interface BINErrorResponse {
  error: BINErrorCode;
  message: string;
}

// --- Custom Error Class ---

export class BINLookupAPIError extends Error {
  constructor(
    public code: BINErrorCode,
    public message: string,
    public statusCode: number
  ) {
    super(`[${code}] ${message}`);
    this.name = 'BINLookupAPIError';
  }
}

// --- SDK Client ---

const USER_AGENT = 'binlookupapi-ts-sdk/1.0.2';

export interface SDKConfig {
  apiKey: string;
  baseUrl?: string;
  /** Maximum number of retries for 5xx errors or network failures */
  maxRetries?: number;
  /**
   * Request timeout in milliseconds. Defaults to 10,000ms (10 seconds).
   * Without a timeout, a slow or unresponsive server would stall the caller indefinitely.
   */
  timeout?: number;
}

export class BINLookupClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeout: number;

  constructor(config: SDKConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.binlookupapi.com';
    this.maxRetries = config.maxRetries ?? 5;
    this.timeout = config.timeout ?? 10_000;
  }

  /**
   * Look up information for a specific BIN.
   * @param bin The 4-8 digit BIN as a number or string.
   */
  async lookup(bin: number | string): Promise<BINLookupResponse> {
    const binNumber = typeof bin === 'string' ? parseInt(bin, 10) : bin;

    if (isNaN(binNumber) || binNumber < 1000 || binNumber > 99999999) {
      throw new BINLookupAPIError(
        'BAD_REQUEST',
        'BIN must be an integer between 4 and 8 digits.',
        400
      );
    }

    return this.requestWithRetry({ number: binNumber });
  }

  /**
   * Internal request handler with exponential backoff retry logic.
   */
  private async requestWithRetry(
    body: BINLookupRequest,
    attempt: number = 0
  ): Promise<BINLookupResponse> {
    // AbortController allows us to cancel the fetch if it exceeds the configured timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/bin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle Success
      if (response.ok) {
        const json = await response.json();
        return {
          ...json,
          quota: {
            limit: parseInt(response.headers.get('X-Quota-Limit') || '0', 10),
            remaining: parseInt(response.headers.get('X-Quota-Remaining') || '0', 10),
            reset: parseInt(response.headers.get('X-Quota-Reset') || '0', 10),
          },
        };
      }

      // Handle Errors
      // Guard against non-JSON error bodies (e.g. HTML gateway errors from a reverse proxy).
      // Without this, a malformed error response would throw an untyped parse error that
      // bypasses retry logic and surfaces as a confusing crash.
      let errorJson: BINErrorResponse;
      try {
        errorJson = await response.json();
      } catch {
        errorJson = { error: 'SERVICE_ERROR', message: `HTTP ${response.status}` };
      }

      // Retry logic for 5xx errors (Service Errors)
      if (response.status >= 500 && attempt < this.maxRetries) {
        return this.retry(body, attempt);
      }

      throw new BINLookupAPIError(
        errorJson.error,
        errorJson.message,
        response.status
      );
    } catch (error) {
      clearTimeout(timer);
      // Retry logic for network/fetch errors (including AbortError from timeout)
      if (!(error instanceof BINLookupAPIError) && attempt < this.maxRetries) {
        return this.retry(body, attempt);
      }
      throw error;
    }
  }

  private async retry(body: BINLookupRequest, attempt: number): Promise<BINLookupResponse> {
    // Jitter (±20%) prevents multiple concurrent clients from thundering-herd retrying
    // at identical intervals after a shared outage.
    const base = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
    const delay = base * (1 + Math.random() * 0.2);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.requestWithRetry(body, attempt + 1);
  }
}

/**
 * Usage Example:
 * * const client = new BINLookupClient({ apiKey: 'YOUR_API_KEY' });
 * * try {
 * const result = await client.lookup(42467101);
 * console.log(`Bank: ${result.data.issuer.name}`);
 * console.log(`Remaining Quota: ${result.quota?.remaining}`);
 * } catch (err) {
 * if (err instanceof BINLookupAPIError) {
 * console.error(`API Error: ${err.code} - ${err.message}`);
 * }
 * }
 */
