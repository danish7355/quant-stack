// server/services/backtestWorker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Dedicated Worker Process / Thread for Backtest Execution.
// Runs off the main event loop to ensure live trading and price streams never lag.
// Supports both child_process.fork (IPC) and worker_threads.
// ─────────────────────────────────────────────────────────────────────────────

import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { BacktestEngine } from './BacktestEngine.ts';
import { BacktestParams } from '../../src/types/backtest.ts';

// Suppress noisy strategy console.logs in the worker to prevent I/O bottlenecks and pipe locks
if (process.env.SILENT_BACKTEST !== 'false') {
  console.log = () => {};
}

function sendMsg(msg: any) {
  if (parentPort) {
    parentPort.postMessage(msg);
  } else if (process.send) {
    process.send(msg);
  }
}

async function executeBacktest(params: BacktestParams) {
  try {
    const engine = new BacktestEngine(params);
    const result = await engine.run((progress, step, message) => {
      sendMsg({
        type: 'progress',
        progress,
        step,
        message,
      });
    });

    sendMsg({
      type: 'complete',
      result,
    });
  } catch (err: any) {
    sendMsg({
      type: 'error',
      error: err?.message || String(err),
    });
  }
}

// 1. Worker Threads Mode
if (!isMainThread && parentPort) {
  const params = workerData as BacktestParams;
  if (params) {
    executeBacktest(params).catch((err) => {
      sendMsg({ type: 'error', error: err?.message || String(err) });
    });
  } else {
    parentPort.on('message', (msg: any) => {
      if (msg?.type === 'start' && msg.params) {
        executeBacktest(msg.params).catch((err) => {
          sendMsg({ type: 'error', error: err?.message || String(err) });
        });
      }
    });
  }
}

// 2. Child Process Fork Mode (IPC)
if (process.send) {
  process.on('message', (msg: any) => {
    if (msg?.type === 'start' && msg.params) {
      executeBacktest(msg.params).catch((err) => {
        sendMsg({ type: 'error', error: err?.message || String(err) });
      });
    }
  });
}
