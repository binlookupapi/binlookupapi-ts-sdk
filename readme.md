# BINLookupAPI TypeScript SDK

A production-ready, fully-typed TypeScript SDK for [BINLookupAPI.com](https://binlookupapi.com). Easily retrieve card network, issuing bank, country, and funding information from Bank Identification Numbers (BINs).

---

## Features

- **Full TypeScript Support**
  Comprehensive interfaces for all request and response objects.

- **Resilient**
  Built-in exponential backoff retry logic (`1s`, `2s`, `4s`, `8s`, `16s`) for transient network or server errors.

- **Detailed Error Handling**
  Custom `BINLookupAPIError` class mapping directly to API error codes.

- **Quota Monitoring**
  Automatic extraction of rate-limit headers:
  - `X-Quota-Limit`
  - `X-Quota-Remaining`

- **Zero Dependencies**
  Lightweight and uses the native `fetch` API.

---

## Installation

```bash
npm i @binlookupapi/binlookupapi-ts-sdk
# or
yarn add @binlookupapi/binlookupapi-ts-sdk
```

---

## Quick Start

1. Sign up and get your free API Key here: https://app.binlookupapi.com/

2.
```ts
import { BINLookupClient, BINLookupAPIError } from '@binlookupapi/binlookupapi-ts-sdk';

const client = new BINLookupClient({
  apiKey: 'your_api_key_here'
});

async function checkCard(bin: string) {
  try {
    const result = await client.lookup(bin);

    console.log(`Scheme: ${result.data.scheme}`); // e.g., "visa"
    console.log(`Bank: ${result.data.issuer.name}`); // e.g., "ING BANK SLASKI SA"
    console.log(`Country: ${result.data.country.name}`); // e.g., "POLAND"

    // Check remaining daily quota
    console.log(`Quota remaining: ${result.quota?.remaining}`);
  } catch (error) {
    if (error instanceof BINLookupAPIError) {
      console.error(`API Error [${error.code}]: ${error.message}`);
    } else {
      console.error('An unexpected error occurred:', error);
    }
  }
}

checkCard('42467101');
```

---

## Configuration

The `BINLookupClient` constructor accepts a configuration object:

| Property     | Type     | Default                              | Description                                      |
|--------------|----------|--------------------------------------|--------------------------------------------------|
| `apiKey`     | `string` | Required                             | Your API key from the dashboard.                 |
| `baseUrl`    | `string` | `https://api.binlookupapi.com`       | Custom API endpoint (if using a proxy).          |
| `maxRetries` | `number` | `5`                                  | Max retries for 5xx errors or network timeouts.  |

---

## API Reference

### `.lookup(bin: number | string)`

Performs a `POST` request to `/v1/bin`.

The BIN must be between **4 and 8 digits**.

---

## Response Object (`BINLookupResponse`)

### `data`

| Field        | Description |
|--------------|-------------|
| `bin`        | The searched BIN. |
| `scheme`     | `visa`, `mastercard`, `amex`, `discover`, `jcb`, `unionpay`, `diners`, or `unknown`. |
| `funding`    | `credit`, `debit`, `prepaid`, or `unknown`. |
| `brand`      | Product name (e.g., `"PLATINUM"`). |
| `country`    | `{ code: string, name: string }` |
| `issuer`     | `{ name: string, website: string, phone: string }` |
| `prepaid`    | `boolean` |
| `commercial` | `boolean` |

### `quota`

| Field        | Description |
|--------------|-------------|
| `limit`      | Total daily allowance. |
| `remaining`  | Requests left for the day. |
| `reset`      | Unix timestamp of the next reset. |

---

## Error Handling

The SDK throws a `BINLookupAPIError` for non-200 responses.

| Error Code         | Description                         |
|--------------------|-------------------------------------|
| `BAD_REQUEST`      | Invalid BIN format.                 |
| `UNAUTHORIZED`     | API key is missing or invalid.      |
| `PAYMENT_REQUIRED` | No active subscription.             |
| `NOT_FOUND`        | BIN not in database.                |
| `QUOTA_EXCEEDED`   | Daily limit reached.                |
| `SERVICE_ERROR`    | Internal API error.                 |

---

## Best Practices

- **Caching**
  BIN data rarely changes. Cache results for **24–48 hours** to reduce quota usage.

- **Environment Variables**
  Never hardcode your API key. Use:

  ```bash
  process.env.BIN_API_KEY
  ```

- **8-Digit BINs**
  When possible, provide **8 digits** for the highest accuracy.

---

## Support

- Documentation: https://binlookupapi.com/docs
- Support: https://binlookupapi.com/contact
