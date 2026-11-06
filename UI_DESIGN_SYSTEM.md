# UI Design System — Automated Crypto Futures Platform

## 1. Design Principles
1. **Clarity First**: The user must understand what the bot is doing and why within 5–10 seconds.
2. **Information Over Decoration**: No gratuitous gradients, AI sparkle icons, or neon distractions. Every visual element communicates financial meaning.
3. **Zero-Pill Discipline**: Metadata is rendered as clean, unboxed text separated by subtle typographic dots (`·`). Badges are reserved exclusively for interactive controls or critical semantic status (e.g. Long vs Short, Active vs Stopped).
4. **Typographic Hierarchy**: High-legibility sans-serif (`font-sans`) for all labels, headings, body text, and explanations; monospace (`font-mono` / tabular figures) strictly for currency values, prices, coordinates, and percentages.
5. **Rock-Solid Performance**: Minimal re-renders, zero chart lag, smooth drawer slide-overs, and responsive layout across desktop, laptop, tablet, and mobile.

---

## 2. Color Palette & Semantics

### Base Surfaces
* **App Canvas**: `#0B0E14` (Deep obsidian black, zero eye-fatigue)
* **Surface Card**: `#121721` (Refined dark slate container)
* **Elevated Surface**: `#1A202E` (Dropdowns, modals, drawers, active tabs)
* **Interactive Hover**: `#222B3D` (Subtle hover feedback)

### Borders & Dividers
* **Subtle Border**: `rgba(255, 255, 255, 0.08)` / `#232B3B`
* **Focus / Active Border**: `rgba(14, 165, 233, 0.4)` / `#0284C7`

### Semantic Financial Colors
* **Positive / Long / Favorable (Emerald)**:
  * Text: `#10B981` (emerald-400 / emerald-500)
  * Background Tint: `rgba(16, 185, 129, 0.12)`
  * Border Tint: `rgba(16, 185, 129, 0.28)`
* **Negative / Short / Veto / Loss (Rose)**:
  * Text: `#F43F5E` (rose-400 / rose-500)
  * Background Tint: `rgba(244, 63, 94, 0.12)`
  * Border Tint: `rgba(244, 63, 94, 0.28)`
* **Caution / Pending / Approaching Limit (Amber)**:
  * Text: `#F59E0B` (amber-400 / amber-500)
  * Background Tint: `rgba(245, 158, 11, 0.12)`
  * Border Tint: `rgba(245, 158, 11, 0.28)`
* **Primary Focus / Connected Stream (Sky Blue)**:
  * Text: `#38BDF8` (sky-400 / sky-500)
  * Background Tint: `rgba(56, 189, 248, 0.12)`
  * Border Tint: `rgba(56, 189, 248, 0.30)`

---

## 3. Typography System

### Font Stacks
* **Primary (UI / Body / Headings)**: `font-sans` (`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
* **Numerical / Financial (Prices, P&L, Dates)**: `font-mono` (`ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, monospace`) with tabular figures.

### Type Scale
* **Display / Stat Value**: `text-2xl` (24px) / `font-bold` / `tracking-tight`
* **Card Title / Section Header**: `text-sm` (14px) / `font-semibold` / `text-gray-200`
* **Table Header / Small Label**: `text-xs` (12px) / `font-medium` / `uppercase` / `tracking-wider` / `text-gray-400`
* **Body / Description**: `text-xs` (12px) or `text-sm` (14px) / `font-normal` / `text-gray-300` / `leading-relaxed`
* **Caption / Timestamp**: `text-[11px]` / `font-normal` / `text-gray-500`

---

## 4. Spacing, Sizing & Radii
* **Grid Baseline**: 4px / 8px / 12px / 16px / 24px / 32px
* **Container Padding**: Desktop `p-6` (24px), Laptop/Tablet `p-4` (16px), Mobile `p-3` (12px)
* **Card Corner Radius**: `rounded-xl` (12px) for major panels; `rounded-lg` (8px) for inner sections; `rounded-md` (6px) for buttons and inputs.
* **Nested Radius Math**: $r_{\text{inner}} = r_{\text{outer}} - \text{padding}$. A card with `rounded-xl` (12px) and `p-3` (12px) has child elements with `rounded-md` (6px) or `rounded-lg` (8px).

---

## 5. UI Components Specification

### A. Bot Master Status Control
* **Running State**:
  * Button: Solid emerald background (`bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40`)
  * Icon: Animated pulsing dot `●` + text `BOT RUNNING`
* **Stopped State**:
  * Button: Rose background (`bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40`)
  * Icon: Static ring `○` + text `BOT STOPPED`
* Click triggers an inline or modal confirmation before altering live trade execution state.

### B. Signal & Decision Card (`SignalCard`)
* **When Setup Detected**:
  * Header: Direction Badge (`LONG` in emerald, `SHORT` in rose) + Target Symbol + Strategy Name.
  * Parameters Grid (2x2):
    * Entry Price (with distance from current mark)
    * Stop Loss (with % risk)
    * Take Profit (with % target)
    * Risk/Reward Ratio (e.g. `1:4.2`)
  * Regime & Confluence Checklist:
    * 4H Trend Alignment (`✓ Bullish (Price > EMA50)`)
    * Market Regime (`✓ Trending Up`)
    * Volume Validation (`✓ 1.8x Supportive`)
  * Rationale Text: Human-readable paragraph explaining why the setup entered execution.
* **When No Setup Detected (Intelligent Stand-Aside)**:
  * Header: Neutral Badge `NO ACTIVE SETUP` · `STANDING ASIDE IN CASH`.
  * Highlight Box: State explanation, e.g.:
    * *"Low volatility consolidation detected (ADX 14 < 20). Capital preserved until high-probability breakout confirmation."*
  * Checklist of Active Scanning Filters:
    * Volume Floor: Met ($10M+)
    * Spread Check: Met (< 0.2%)
    * Regime Gate: Evaluating (2/3 bars)

### C. Tables (Active Positions & Order Journal)
* **Header**: Quiet text in uppercase (`text-[11px] font-semibold tracking-wider text-gray-400 uppercase bg-[#0B0E14]/60 border-b border-[#232B3B]`).
* **Row Spacing**: `py-3 px-4` for high information density without feeling cramped.
* **Hover State**: `hover:bg-[#1A202E]/60 transition-colors`.
* **Numeric Columns**: Right-aligned with tabular figures for instant visual scanning.
* **Actions**: Inline, accessible buttons with tooltips.

### D. Trade Detail Slide-Over Drawer
* Slides in smoothly from the right viewport boundary (`w-full sm:w-[480px]`).
* Accessible backdrop blur.
* Displays:
  * Trade ID & Execution Timestamp
  * Strategy & Market Regime at Entry
  * Full Price Journey (Entry, SL, TP1, TP2, Exit)
  * Realized P&L in USDT and percentage
  * Risk/Reward achieved
  * Fees and Slippage breakdown
  * Human-readable setup notes and veto factors

### E. Empty, Loading, and Error States
* **Empty State**: Centered icon (in quiet gray/sky), clear title, explanatory paragraph, and primary action button (e.g. "Trigger Manual Scan" or "Explore Strategies"). Never styled like an error.
* **Loading State**: Subtle pulsing skeletons matching the exact geometry of the loaded component; no layout shifts.
* **Error State**: Rose tint icon, human-readable cause (e.g., "Live data feed reconnecting..."), and actionable [Reconnect] button. Technical error details collapsed under "Diagnostics".

---

## 6. Responsive Behavior
* **Desktop (≥ 1440px)**: Persistent sidebar, multi-column dashboard (65% chart / 35% decision card), full width data tables.
* **Laptop (1024px – 1439px)**: Compact sidebar (collapsed by default or icons only), stacked or adjusted ratio panels.
* **Tablet (768px – 1023px)**: Single-column stacked layout; horizontal swipeable sub-tabs; drawers take 80% viewport.
* **Mobile (< 768px)**: Full-width stacked cards; mobile hamburger drawer; tables feature horizontal scroll with frozen Symbol column.
