import fs from 'fs';

let content = fs.readFileSync('server/services/AutoTrader.ts', 'utf8');

// I will insert a regimeHistory map into the class.
content = content.replace(
  /private lastTradedSignal = new Map<string, number>\(\);/,
  `private lastTradedSignal = new Map<string, number>();
  private regimeHistory = new Map<string, string[]>();`
);

// I will replace evaluateAutoRegimeSignal completely.
const regexAutoRegime = /private async evaluateAutoRegimeSignal\([\s\S]*?\n  \}\n/g;

const newAutoRegime = `private async evaluateAutoRegimeSignal(
    symbol: string,
    klines: any[],
    currentPrice: number,
    cachedClassification?: any,
    cachedGlobalRegime?: any
  ): Promise<{
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    score: number;
    atr: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    reason?: string;
    strategy?: string;
    marketRegime?: string;
    isAutoRegime?: boolean;
    frequencyPreset?: string;
    macroColor?: string;
    signalTime?: number;
    compressionHigh?: number;
    compressionLow?: number;
  } | null> {
    if (klines.length < 35) return null;

    const globalRegime = cachedGlobalRegime || await this.getGlobalRegime();
    if (!globalRegime.isTradable || globalRegime.macroColor === 'RED') {
      return null;
    }

    const classification = cachedClassification || classifyMarketRegime(klines, currentPrice, globalRegime.macroColor);
    const currentRegime = classification.regime;

    if (currentRegime === 'PANIC' || currentRegime === 'DEAD_VOLUME' || currentRegime === 'UNCLEAR') {
      return null;
    }

    // 2-Bar Confirmation Hysteresis
    const history = this.regimeHistory.get(symbol) || [];
    history.push(currentRegime);
    if (history.length > 3) history.shift();
    this.regimeHistory.set(symbol, history);

    if (history.length < 2 || history[history.length - 1] !== history[history.length - 2]) {
      return null; // Awaiting confirmation
    }

    const bucket: StrategyBucketItem[] = (this.settings.strategyBucket && this.settings.strategyBucket.length > 0)
      ? this.settings.strategyBucket
      : DEFAULT_STRATEGY_BUCKET;

    const eligibleCandidates = getEligibleBucketStrategies(bucket, currentRegime, globalRegime.macroColor);
    if (eligibleCandidates.length === 0) {
      return null;
    }

    for (const candidate of eligibleCandidates) {
      let pendingSignal: any = null;

      if (candidate.id === 'TREND_PULLBACK' && currentRegime.startsWith('TRENDING')) {
        const pullbackSignal = evaluateTrendPullback(klines, currentPrice, this.settings as any);
        if (pullbackSignal && pullbackSignal.score >= this.settings.autoTradeThreshold && pullbackSignal.direction === candidate.direction) {
          pendingSignal = { ...pullbackSignal };
        }
      }

      if (candidate.id === 'BINANCE_COMPOSITE' && currentRegime === 'RANGING') {
        const compositeSignal = this.evaluateCompositeStrategy(klines, currentPrice);
        if (compositeSignal && compositeSignal.score >= this.settings.autoTradeThreshold) {
          pendingSignal = { ...compositeSignal };
        }
      }

      if (candidate.id === 'VOLATILITY_COMPRESSION' && currentRegime.startsWith('BREAKOUT')) {
        const vcbSignal = await this.evaluateVolatilityCompression(symbol, klines, currentPrice);
        if (vcbSignal && vcbSignal.score >= this.settings.autoTradeThreshold && vcbSignal.direction === candidate.direction) {
          pendingSignal = { ...vcbSignal };
        }
      }

      if (candidate.id === 'EARLY_COIL_BREAKOUT' && currentRegime.startsWith('BREAKOUT')) {
        const coilSignal = evaluateEarlyCoilBreakout(klines, this.settings as any);
        if (coilSignal && coilSignal.score >= this.settings.autoTradeThreshold && coilSignal.direction === candidate.direction) {
          pendingSignal = { ...coilSignal };
        }
      }

      if (candidate.id === 'DELTA_CLIMAX' && (currentRegime.startsWith('EXHAUSTION') || currentRegime === 'RANGING')) {
        const climaxSignal = this.evaluateClimaxReversal(klines, currentPrice);
        if (climaxSignal && climaxSignal.score >= this.settings.autoTradeThreshold && (!candidate.direction || climaxSignal.direction === candidate.direction)) {
          pendingSignal = { ...climaxSignal };
        }
      }

      if (candidate.id === 'SMC_LIQUIDITY_SWEEP' && (currentRegime.startsWith('EXHAUSTION') || currentRegime === 'RANGING' || currentRegime.startsWith('TRENDING'))) {
        try {
          const htfCandles = await this.getKlines(symbol, '1h');
          const smcSig = evaluateSmc(klines, htfCandles, currentPrice);
          if (smcSig && smcSig.score >= this.settings.autoTradeThreshold && (!candidate.direction || smcSig.direction === candidate.direction)) {
            const risk = Math.abs(currentPrice - smcSig.sl);
            pendingSignal = {
              direction: smcSig.direction,
              score: smcSig.score,
              atr: risk,
              sl: smcSig.sl,
              tp1: smcSig.tp1,
              tp2: smcSig.direction === 'LONG' ? currentPrice + (risk * 3) : currentPrice - (risk * 3),
              tp3: smcSig.direction === 'LONG' ? currentPrice + (risk * 5) : currentPrice - (risk * 5),
              signalTime: smcSig.signalTime
            };
          }
        } catch (e) {
          console.error(\`HTF fetch failed for \${symbol} SMC sweep:\`, e);
        }
      }

      if (pendingSignal) {
         // Hard Gate: Veto-plus-score model structure
         const risk = Math.abs(currentPrice - pendingSignal.sl);
         const reward3 = Math.abs(pendingSignal.tp3 - currentPrice);
         
         const rrPass = risk > 0 && (reward3 / risk) >= 3.0; // Hard structural RR gate
         const scorePass = globalRegime.macroColor === 'AMBER' ? (pendingSignal.score >= 80) : (pendingSignal.score >= 70); // Veto on score
         
         if (rrPass && scorePass) {
             return {
                 ...pendingSignal,
                 strategy: candidate.id,
                 marketRegime: classification.regime,
                 isAutoRegime: true,
                 reason: \`[\${currentRegime}] \${candidate.id} Conf:\${pendingSignal.score} RR:\${(reward3/risk).toFixed(1)}\`
             };
         } else {
             // Record the rejection to allow data-driven adjustments later
             this.logScanResult(symbol, pendingSignal.direction, false, \`Gate Failed: RR=\${(reward3/risk).toFixed(1)}, Score=\${pendingSignal.score}, Req=\${globalRegime.macroColor === 'AMBER' ? 80 : 70}\`, currentPrice, pendingSignal.sl, pendingSignal.tp1, pendingSignal.score);
         }
      }
    }

    return null;
  }`;

content = content.replace(regexAutoRegime, newAutoRegime);

fs.writeFileSync('server/services/AutoTrader.ts', content);
