async function run() {
      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
      let data = await res.json();
      
      let usdtPairs = data.filter(d => 
        d.symbol.endsWith('USDT') && 
        !d.symbol.includes('_') &&
        parseFloat(d.quoteVolume) > 10000000 
      );

      usdtPairs.sort((a, b) => parseFloat(a.lastPrice) - parseFloat(b.lastPrice));
      console.log(usdtPairs.slice(0, 10).map(d => ({ symbol: d.symbol, price: d.lastPrice, vol: d.quoteVolume })));
}
run();
