import {
  backpack as BackpackExchange,
  bybit as BybitExchange,
  Exchange,
  NetworkError,
  ExchangeError,
} from 'ccxt';
import { config } from './config';
import { PriceSnapshot } from './types';

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  console.log(`${new Date().toISOString()} [${level}] ${msg}`);
}

function createExchanges(): { backpack: Exchange; bybit: Exchange } {
  const backpack = new BackpackExchange({
    apiKey: config.backpack.apiKey,
    secret: config.backpack.secret,
    enableRateLimit: true,
  });
  const bybit = new BybitExchange({
    apiKey: config.bybit.apiKey,
    secret: config.bybit.secret,
    enableRateLimit: true,
    options: { defaultType: 'linear' },
  });
  return { backpack, bybit };
}

function getTopLevels(orderBook: { bids?: number[][]; asks?: number[][] }): {
  bid: number | undefined;
  ask: number | undefined;
} {
  const bid = orderBook.bids?.[0]?.[0];
  const ask = orderBook.asks?.[0]?.[0];
  return { bid, ask };
}

async function fetchPrices(backpack: Exchange, bybit: Exchange): Promise<PriceSnapshot> {
  const [spotBook, futures] = await Promise.all([
    backpack.fetchOrderBook(config.spotSymbol, 1),
    bybit.fetchTicker(config.futuresSymbol),
  ]);
  const { bid: backpackBid, ask: backpackAsk } = getTopLevels(spotBook as { bids?: number[][]; asks?: number[][] });
  const bybitBid = futures.bid as number | undefined;
  const bybitAsk = futures.ask as number | undefined;

  if (
    backpackBid == null ||
    backpackAsk == null ||
    bybitBid == null ||
    bybitAsk == null
  ) {
    throw new Error(
      `Missing orderbook top levels: backpack bid=${String(backpackBid)} ask=${String(backpackAsk)} bybit bid=${String(bybitBid)} ask=${String(bybitAsk)}`,
    );
  }

  const openSpread = (bybitAsk - backpackBid) / backpackBid;
  const closeSpread = (bybitBid - backpackAsk) / backpackAsk;

  return { backpackBid, backpackAsk, bybitBid, bybitAsk, openSpread, closeSpread };
}

async function openPosition(backpack: Exchange, bybit: Exchange, snap: PriceSnapshot): Promise<void> {
  log(
    'INFO',
    `▶ OPEN  backpack bid/ask=${snap.backpackBid.toFixed(4)}/${snap.backpackAsk.toFixed(4)} bybit bid/ask=${snap.bybitBid.toFixed(4)}/${snap.bybitAsk.toFixed(4)} openSpread=${(snap.openSpread * 100).toFixed(3)}%`,
  );

  const spot = await backpack.createOrder(config.spotSymbol, 'market', 'buy', config.spotAmount);
  if (spot.status !== 'closed') {
    throw new Error(`Spot BUY not filled (status=${spot.status}, id=${spot.id})`);
  }
  log('INFO', `Backpack BUY  id=${spot.id} filled=${spot.filled}`);

  const futures = await bybit.createOrder(config.futuresSymbol, 'market', 'sell', config.spotAmount, undefined, { reduceOnly: false });
  log('INFO', `Bybit   SHORT id=${futures.id}`);
}

async function closePosition(backpack: Exchange, bybit: Exchange, snap: PriceSnapshot): Promise<void> {
  log(
    'INFO',
    `◀ CLOSE backpack bid/ask=${snap.backpackBid.toFixed(4)}/${snap.backpackAsk.toFixed(4)} bybit bid/ask=${snap.bybitBid.toFixed(4)}/${snap.bybitAsk.toFixed(4)} closeSpread=${(snap.closeSpread * 100).toFixed(3)}%`,
  );

  const spot = await backpack.createOrder(config.spotSymbol, 'market', 'sell', config.spotAmount);
  if (spot.status !== 'closed') {
    throw new Error(`Spot SELL not filled (status=${spot.status}, id=${spot.id})`);
  }
  log('INFO', `Backpack SELL id=${spot.id} filled=${spot.filled}`);

  const futures = await bybit.createOrder(config.futuresSymbol, 'market', 'buy', config.spotAmount, undefined, { reduceOnly: true });
  log('INFO', `Bybit   CLOSE id=${futures.id}`);
}

export async function runBot(): Promise<void> {
  log('INFO', `spot=${config.spotSymbol}  futures=${config.futuresSymbol}  amount=${config.spotAmount}`);
  log('INFO', `open>${(config.openThreshold * 100).toFixed(1)}%  close<${(config.closeThreshold * 100).toFixed(1)}%  poll=${config.pollIntervalMs}ms`);

  const { backpack, bybit } = createExchanges();

  for (;;) {
    try {
      const snap = await fetchPrices(backpack, bybit);
      log(
        'INFO',
        `backpack bid/ask=${snap.backpackBid.toFixed(4)}/${snap.backpackAsk.toFixed(4)} bybit bid/ask=${snap.bybitBid.toFixed(4)}/${snap.bybitAsk.toFixed(4)} openSpread=${(snap.openSpread * 100).toFixed(3)}% closeSpread=${(snap.closeSpread * 100).toFixed(3)}%`,
      );

      if (snap.openSpread > config.openThreshold) {
        await openPosition(backpack, bybit, snap);
      } else if (snap.closeSpread < config.closeThreshold) {
        await closePosition(backpack, bybit, snap);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof NetworkError) {
        log('WARN',  `Network error: ${msg}`);
      } else if (err instanceof ExchangeError) {
        log('ERROR', `Exchange error: ${msg}`);
      } else {
        log('ERROR', `Unexpected error: ${msg}`);
      }
    }

    await new Promise(r => setTimeout(r, config.pollIntervalMs));
  }
}
