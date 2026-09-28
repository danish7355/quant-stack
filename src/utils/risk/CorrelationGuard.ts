// src/utils/risk/CorrelationGuard.ts
// ─────────────────────────────────────────────────────────────────────────────
// Architectural Enhancement 3: Portfolio Correlation Guard
// ─────────────────────────────────────────────────────────────────────────────

export interface CorrelationConfig {
  maxCorrelatedExposure?: number;  // 0.60 (60%)
  correlationThreshold?: number;   // 0.70
  lookbackDays?: number;           // 30
}

export class CorrelationGuard {
  private correlationMatrix: Map<string, Map<string, number>> = new Map();
  private config: Required<CorrelationConfig>;

  constructor(config: CorrelationConfig = {}) {
    this.config = {
      maxCorrelatedExposure: config.maxCorrelatedExposure ?? 0.60,
      correlationThreshold: config.correlationThreshold ?? 0.70,
      lookbackDays: config.lookbackDays ?? 30
    };
  }

  // === UPDATE CORRELATION MATRIX (Call daily) ===
  public async updateCorrelationMatrix(
    symbols: string[],
    dailyReturns: Record<string, number[]>
  ): Promise<void> {
    this.correlationMatrix.clear();

    for (const symbolA of symbols) {
      this.correlationMatrix.set(symbolA, new Map());

      for (const symbolB of symbols) {
        if (symbolA === symbolB) {
          this.correlationMatrix.get(symbolA)!.set(symbolB, 1.0);
          continue;
        }

        const returnsA = dailyReturns[symbolA] || [];
        const returnsB = dailyReturns[symbolB] || [];

        const correlation = this.calculatePearsonCorrelation(returnsA, returnsB);
        this.correlationMatrix.get(symbolA)!.set(symbolB, correlation);
      }
    }
  }

  // === CHECK BEFORE OPENING NEW POSITION ===
  public canOpenPosition(
    newSymbol: string,
    direction: 'LONG' | 'SHORT',
    currentPositions: Array<{ symbol: string; direction: string; sizePct: number }>
  ): { allowed: boolean; reason?: string } {
    const correlatedExposure = this.calculateCorrelatedExposure(
      newSymbol,
      direction,
      currentPositions
    );

    if (correlatedExposure > this.config.maxCorrelatedExposure) {
      return {
        allowed: false,
        reason: `Correlated exposure (${(correlatedExposure * 100).toFixed(1)}%) ` +
                `exceeds limit (${(this.config.maxCorrelatedExposure * 100).toFixed(1)}%)`
      };
    }

    return { allowed: true };
  }

  // === HELPER: Calculate Correlated Exposure ===
  private calculateCorrelatedExposure(
    newSymbol: string,
    newDirection: string,
    currentPositions: Array<{ symbol: string; direction: string; sizePct: number }>
  ): number {
    const newSymbolCorrelations = this.correlationMatrix.get(newSymbol);
    if (!newSymbolCorrelations) return 0;

    let correlatedExposure = 0;

    for (const position of currentPositions) {
      // Only count same-direction positions
      if (position.direction !== newDirection) continue;

      const correlation = newSymbolCorrelations.get(position.symbol) || 0;

      if (correlation >= this.config.correlationThreshold) {
        correlatedExposure += position.sizePct;
      }
    }

    return correlatedExposure;
  }

  // === HELPER: Pearson Correlation ===
  public calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 5) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
    const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let xVariance = 0;
    let yVariance = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = xSlice[i] - xMean;
      const yDiff = ySlice[i] - yMean;

      numerator += xDiff * yDiff;
      xVariance += xDiff * xDiff;
      yVariance += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xVariance * yVariance);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }
}
