# QUANT PRO — Permanent Architectural & Operational Rules

## Rule 1: Absolute Synchronization Between Frontend and Backend
1. **Frontend Customization Supremacy**: The Frontend UI (SettingsPanel, GateManager, RegimeVisualizer, TradeEngineBanner) is the authoritative operator control surface. Any setting, gate toggle, bypass toggle, strategy selection, or preset applied on the Frontend MUST be immediately saved to the backend via `POST /api/bot/settings` and immediately respected by `AutoTrader`, `RiskManager`, `OMS`, and all strategy runners.
2. **Never Ignore UI Gate Customizations**: The backend engine MUST check `this.settings.disabledGates` and explicit bypass flags (`bypassMaxPositions`, `bypassDailyLossLimit`, `bypassLiquidationBuffer`, `bypassTradeCooldown`, `bypassRegimeStandAside`). If an operator disables or bypasses a gate in the UI, the backend must honor that bypass and NEVER let that gate block trade execution.
3. **No Phantom Overwrites**: Background polling (e.g. 8-second status check in App.tsx) must NEVER overwrite settings while the user is viewing or editing them. When server settings update, the server must broadcast a WebSocket `SETTINGS_UPDATE` event so all frontend views update instantaneously without race conditions.
4. **Credential Security**: Raw API keys, secrets, and tokens must always be masked (`****`) in all client GET and POST responses.

---

## Rule 2: Strategy Logic as the Sole Arbiter of Trading
1. **No Hardcoded Silent Kills**: Non-strategy filters (e.g., fee drag, regime confidence, local transition state, volume floor, stop distance floor, structural R:R) must NEVER unconditionally hard-block signals without respecting bypass toggles.
2. **Bypass Toggles for All Non-Strategy Gates**:
   - `bypassMaxPositions` / `disabledGates.RISK_maxConcurrent`: Bypasses max concurrent trades limits.
   - `bypassDailyLossLimit` / `disabledGates.RISK_dailyLoss`: Bypasses daily drawdown halts.
   - `bypassTradeCooldown`: Bypasses post-trade symbol cooldown timeouts.
   - `bypassLiquidationBuffer` / `disabledGates.CR_stopDistance`: Bypasses the minimum stop distance floor.
   - `disabledGates.RISK_threshold`: Bypasses the global score threshold gate.
   - `bypassRegimeStandAside` / `disabledGates.COMPOSITE_g3`: Bypasses per-coin TRANSITION/PANIC stand-aside gating.
   - `enableRegimeLayer3Gate`: Bypasses Layer 3 fee drag and friction gate when false.
3. **Closed-Candle Integrity**: Technical indicators, pattern recognition, and volume comparisons must evaluate on completed (closed) candles (`klines.slice(0, -1)`) to eliminate intra-bar false signals and volume-ratio distortion.
4. **Preserve All 12 Strategies**: All 12 strategies must remain fully implemented, wired in the dispatch table, and capable of generating orders without synthetic hurdles.

---

## Rule 3: Diagnostic Logging & Transparency
1. Every gate evaluation, whether passing or failing, must be logged with specific reasons and metrics via `logScanResult` so the operator has complete visibility in the Scan Table and diagnostics modal.
2. Silent `return null` exits without diagnostic logging are strictly prohibited in the scan and execution pipelines.

---

## Rule 4: Mandatory Server Restart Upon Code Modifications
1. **Always Restart Server After Edits**: Whenever any code changes are made in the project (backend services, API routes, calculation logic, strategies, types, or frontend components), any running server process MUST be cleanly stopped and restarted immediately with the new changes.
2. **Verify Server Health Post-Restart**: Check the process log to verify the server initializes cleanly without uncaught exceptions or compilation errors, and confirm active connectivity.
