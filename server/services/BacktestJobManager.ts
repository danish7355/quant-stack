// server/services/BacktestJobManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Background Backtest Job Manager.
// Spawns dedicated child processes with TSX, tracks job states, and streams progress.
// Includes seamless non-blocking async fallback for resilient execution.
// ─────────────────────────────────────────────────────────────────────────────

import { Worker } from 'node:worker_threads';
import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { Response } from 'express';
import { BacktestEngine } from './BacktestEngine.ts';
import {
  BacktestParams,
  BacktestJobStatus,
  BacktestResult
} from '../../src/types/backtest.ts';

export class BacktestJobManager {
  private jobs: Map<string, BacktestJobStatus> = new Map();
  private sseClients: Map<string, Set<Response>> = new Map();
  private activeWorkers: Map<string, Worker> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  public onJobUpdate?: (job: BacktestJobStatus) => void;

  constructor() {}

  public getJob(jobId: string): BacktestJobStatus | undefined {
    return this.jobs.get(jobId);
  }

  public getAllJobs(): BacktestJobStatus[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public registerSseClient(jobId: string, res: Response): void {
    if (!this.sseClients.has(jobId)) {
      this.sseClients.set(jobId, new Set());
    }
    const clients = this.sseClients.get(jobId)!;
    clients.add(res);

    // Send immediate snapshot of current status
    const current = this.jobs.get(jobId);
    if (current) {
      res.write(`data: ${JSON.stringify(current)}\n\n`);
    }

    res.on('close', () => {
      clients.delete(res);
      if (clients.size === 0) {
        this.sseClients.delete(jobId);
      }
    });
  }

  private broadcastSse(jobId: string, job: BacktestJobStatus): void {
    const clients = this.sseClients.get(jobId);
    if (!clients || clients.size === 0) return;

    const data = `data: ${JSON.stringify(job)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch (e) {}
    }

    // If job is finished, end SSE streams
    if (job.status === 'completed' || job.status === 'failed') {
      for (const client of clients) {
        try {
          client.end();
        } catch (e) {}
      }
      this.sseClients.delete(jobId);
    }
  }

  private updateJob(jobId: string, update: Partial<BacktestJobStatus>): BacktestJobStatus {
    const existing = this.jobs.get(jobId);
    if (!existing) return update as BacktestJobStatus;

    const updated: BacktestJobStatus = {
      ...existing,
      ...update,
      updatedAt: Date.now()
    };

    this.jobs.set(jobId, updated);
    this.broadcastSse(jobId, updated);
    this.onJobUpdate?.(updated);
    return updated;
  }

  private async runAsync(jobId: string, params: BacktestParams): Promise<void> {
    try {
      this.updateJob(jobId, {
        status: 'running',
        progress: 5,
        message: 'Running backtest simulation...',
        currentStep: 'replay'
      });

      const engine = new BacktestEngine(params);
      const result = await engine.run((progress, step, message) => {
        this.updateJob(jobId, { progress, currentStep: step, message });
      });

      result.jobId = jobId;
      this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `Backtest completed successfully (${result.trades.length} trades).`,
        result
      });
    } catch (err: any) {
      console.error(`[BacktestJobManager] Async run error for ${jobId}:`, err);
      this.updateJob(jobId, {
        status: 'failed',
        error: err?.message || String(err),
        message: `Simulation error: ${err?.message || err}`
      });
    }
  }

  public startJob(params: BacktestParams): string {
    const jobId = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const initialStatus: BacktestJobStatus = {
      jobId,
      status: 'running',
      progress: 0,
      message: 'Initializing backtest worker...',
      currentStep: 'init',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.jobs.set(jobId, initialStatus);
    this.onJobUpdate?.(initialStatus);

    const workerPath = path.resolve('server/services/backtestWorker.ts');
    
    try {
      const child = fork(workerPath, [], {
        execArgv: ['--import', 'tsx'],
        env: { ...process.env, SILENT_BACKTEST: 'true' },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
      });

      this.activeProcesses.set(jobId, child);

      child.stderr?.on('data', (data) => {
        console.error(`[BacktestWorker ${jobId} stderr]:`, data.toString());
      });

      child.on('message', (msg: any) => {
        if (msg.type === 'progress') {
          this.updateJob(jobId, {
            progress: msg.progress,
            currentStep: msg.step,
            message: msg.message
          });
        } else if (msg.type === 'complete') {
          const result = msg.result as BacktestResult;
          result.jobId = jobId;
          this.updateJob(jobId, {
            status: 'completed',
            progress: 100,
            message: `Backtest completed successfully (${result.trades.length} trades).`,
            result
          });
          this.activeProcesses.delete(jobId);
          try { child.kill(); } catch (e) {}
        } else if (msg.type === 'error') {
          console.warn(`[BacktestJobManager] Worker reported error for ${jobId}:`, msg.error);
          this.activeProcesses.delete(jobId);
          this.updateJob(jobId, {
            status: 'failed',
            error: msg.error,
            message: `Backtest failed: ${msg.error}`
          });
          try { child.kill(); } catch (e) {}
        }
      });

      child.on('error', (err) => {
        console.warn(`[BacktestJobManager] Child process spawn error for ${jobId}:`, err.message);
        this.activeProcesses.delete(jobId);
        this.updateJob(jobId, {
          status: 'failed',
          error: err.message,
          message: `Worker spawn error: ${err.message}`
        });
      });

      child.on('exit', (code, signal) => {
        this.activeProcesses.delete(jobId);
        const current = this.jobs.get(jobId);
        if (current && current.status === 'running') {
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            this.updateJob(jobId, {
              status: 'failed',
              error: 'Job cancelled by operator.',
              message: 'Cancelled.'
            });
          } else {
            this.updateJob(jobId, {
              status: 'failed',
              error: `Worker process exited (code ${code}).`,
              message: `Simulation exited with code ${code}.`
            });
          }
        }
      });

      // Send execution start command with params via IPC
      child.send({ type: 'start', params });

    } catch (e: any) {
      console.warn(`[BacktestJobManager] Child process spawn failed for ${jobId}, running in async mode:`, e);
      this.runAsync(jobId, params);
    }

    return jobId;
  }

  public cancelJob(jobId: string): boolean {
    const child = this.activeProcesses.get(jobId);
    if (child) {
      try {
        child.kill('SIGKILL');
      } catch (e) {}
      this.activeProcesses.delete(jobId);
    }
    const worker = this.activeWorkers.get(jobId);
    if (worker) {
      try {
        worker.terminate();
      } catch (e) {}
      this.activeWorkers.delete(jobId);
    }
    this.updateJob(jobId, {
      status: 'failed',
      error: 'Job cancelled by operator.',
      message: 'Cancelled by operator.'
    });
    return true;
  }
}

export const backtestJobManager = new BacktestJobManager();
