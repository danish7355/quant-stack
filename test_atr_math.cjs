const klines = [
  // 14 random candles for ATR
];
for(let i=0; i<15; i++) {
   klines.push({high: 10 + Math.random(), low: 9 + Math.random(), close: 9.5 + Math.random()});
}
let trSum = 0;
let i = 14;
for (let j = i - 14; j < i; j++) {
    const h = klines[j].high;
    const l = klines[j].low;
    const pc = klines[j-1] ? klines[j-1].close : klines[j].open || klines[j].low;
    trSum += Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
}
const atr = trSum / 14 || (klines[i].high - klines[i].low);
console.log(`ATR Math works: ${atr}`);
