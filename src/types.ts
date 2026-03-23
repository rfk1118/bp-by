export interface PriceSnapshot {
  backpackBid: number;
  backpackAsk: number;
  bybitBid: number;
  bybitAsk: number;
  openSpread: number; // (bybit ask1 - backpack bid1) / backpack bid1
  closeSpread: number; // (bybit bid1 - backpack ask1) / backpack ask1
}
