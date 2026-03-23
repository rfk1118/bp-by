import * as dotenv from 'dotenv';
dotenv.config();

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const symbol = env('SYMBOL', 'BP');

export const config = {
  spotSymbol:    `${symbol}/USDC`,
  futuresSymbol: `${symbol}/USDT:USDT`,

  spotAmount:     parseFloat(env('SPOT_AMOUNT',    '1000')),
  openThreshold:  parseFloat(env('OPEN_THRESHOLD',  '0.03')),
  closeThreshold: parseFloat(env('CLOSE_THRESHOLD', '0.01')),
  pollIntervalMs:   parseInt(env('POLL_INTERVAL_MS', '100')),

  backpack: {
    apiKey: env('BACKPACK_API_KEY', ''),
    secret: env('BACKPACK_SECRET',  ''),
  },
  bybit: {
    apiKey: env('BYBIT_API_KEY', ''),
    secret: env('BYBIT_SECRET',  ''),
  },
} as const;
