# Laravel API Configuration

This extension now supports using the Laravel UTXO recovery API for enhanced consolidation features.

## Features

The Laravel API provides:

1. **Claimable UTXO Detection** - Only shows UTXOs the address can actually spend (not just what it created)
2. **Probability Scoring** - Confidence levels for each UTXO's spendability
3. **Stamp Detection** - Automatically identifies Bitcoin Stamps to exclude from consolidation
4. **Smart Fee Configuration** - Dynamic service fee settings

## Configuration

### For Development

Set the `LARAVEL_API_URL` environment variable:

```bash
# .env.local (create this file, it's gitignored)
LARAVEL_API_URL=http://localhost:8000
```

Or when running the dev server:

```bash
LARAVEL_API_URL=http://localhost:8000 npm run dev
```

### For Production

Update the default URL in `src/utils/blockchain/bitcoin/bareMultisig.ts`:

```typescript
async function getLaravelApiBase(): Promise<string> {
  // Check for environment variable first (for local development)
  if (typeof process !== 'undefined' && process.env?.LARAVEL_API_URL) {
    return process.env.LARAVEL_API_URL;
  }
  
  // Update this to your production Laravel API URL
  return 'https://your-laravel-api.com';
}
```

## API Endpoints Used

The extension uses these Laravel API endpoints:

### Claimable UTXOs
```
GET /api/v1/address/{address}/claimable
```
Returns UTXOs that the address can spend (not just created).

Query parameters:
- `min_probability` (default: 50) - Minimum confidence level
- `include_metadata` (default: false) - Include extra metadata

### Fee Configuration
```
GET /api/v1/consolidation/fee-config
```
Returns the service fee configuration.

Response:
```json
{
  "fee_address": "bc1q...",
  "fee_percent": 10
}
```

## Fallback Behavior

The extension gracefully falls back to the original XCP.io API if:
- Laravel API is unavailable
- Laravel API returns an error
- Required data is missing from Laravel response

This ensures the consolidation feature always works, even without the Laravel API.

## Benefits of Using Laravel API

1. **More Accurate** - Only shows UTXOs you can actually spend
2. **Faster** - Pre-analyzed data reduces processing time
3. **Smarter** - Excludes unspendable UTXOs automatically
4. **Safer** - Probability scoring helps avoid failed transactions

## Testing

To test with the Laravel API:

1. Set up your Laravel backend with the UTXO recovery system
2. Configure the `LARAVEL_API_URL` environment variable
3. Open the consolidation page in the extension
4. Check the console for "Using Laravel API" messages
5. Verify the UTXO count matches what the Laravel API returns

## Troubleshooting

### Laravel API not being used

Check the browser console for error messages. Common issues:

- CORS not configured on Laravel API
- Wrong API URL configured
- Laravel API not running
- Network connectivity issues

### Incorrect UTXO counts

The Laravel API filters UTXOs based on spendability. If counts differ from XCP.io:

- Laravel only shows UTXOs you can spend (not all created by address)
- Probability threshold filters out low-confidence UTXOs
- Stamp filtering may exclude some UTXOs

### Missing scriptPubKeyHex

Currently, the extension still fetches scriptPubKeyHex from XCP.io. Future Laravel API versions should include this data.