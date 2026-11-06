import ccxt from 'ccxt';
const ex = new ccxt.binance({ options: { defaultType: 'future' }});
console.log(Object.keys(ex).filter(k => k.toLowerCase().includes('listen')));
