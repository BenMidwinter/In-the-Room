# Hardware Inset Tray Architecture

Principal frontend architecture plan for Process&Note. This document audits the current UI system and defines a phased refactor toward an Apple-inspired recessed "tray" surface language, using the existing React + TypeScript + Tailwind CSS v4 stack.

**Status:** Planning only. No product chrome has been migrated yet.  
**Brand constraint:** Keep the existing Process&Note palette (warm canvas, forest accent, Fraunces / Karla). The change is geometry and depth language, not a rebrand.

---

## Step 1 — Codebase audit

### 1.1 Stack reality (important)

| Expectation | Actual |
|-------------|--------|
| `tailwind.config.{js,ts}` | **None.** Tailwind CSS **v4** via `@tailwindcss/vite`. Theme lives in CSS. |
| Theme entry | `src/index.css` → `@import "tailwindcss"` + `src/styles/tokens.css` (`@theme` bridge) |
| Component CSS | Layered legacy BEM in `src/styles/*.css` under `@layer components`, so Tailwind utilities can win incrementally |
| Incremental migration | Comments like `/* tailwind-migration: deferred — … */` already mark deferred islands |

Implication: token and utility work belongs in `tokens.css` (`:root` + `@theme` + `@utility`), not a JS config file.

### 1.2 Current design tokens (`src/styles/tokens.css`)

**Surfaces (practice theme)**

| Token | Value | Role today |
|-------|-------|------------|
| `--bg-canvas` / `--bg-page` | `#fbf9f5` | App / page canvas |
| `--bg-surface` | `#ffffff` | Cards, nav, panels |
| `--bg-muted` | `#f3efea` | Table headers, muted wells |
| `--bg-subtle` | `#eae5de` | Soft fills |
| `--border-subtle` / `--border-strong` | `#e5e0d8` / `#c8c2b7` | Hairlines exist, but often paired with elevation |

**Radius**

```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
```

These are independent presets. There is **no concentric formula** tying parent radius to padding + child radius.

**Elevation (paper metaphor)**

```css
--shadow-sm: none;
--shadow-md: 0 1px 3px rgba(35, 34, 32, 0.06);
--elevation-paper-0 … --elevation-paper-4  /* soft drop shadows */
```

Depth today is primarily **+Z float**, not recessed tone steps.

**Tailwind `@theme` bridge** already exposes semantic colours (`page`, `surface`, `zone`, `line`, `ink`, …) but not tray / bezel / inset strata.

### 1.3 Layout & chrome inventory

| Layer | Primary files | Current pattern |
|-------|---------------|-----------------|
| App shell | `AppLayout.jsx`, `base.css` (`.app-shell`, `.top-nav`, `.main-content`) | Flat flex row: sticky side nav + full-bleed main canvas. No outer chassis inset. |
| Page mast | `PageHeader.jsx`, `.page` / `.page-mast` | Full-width surface strip with left accent bar (`::before` gradient). |
| Section chrome | `SectionCard.jsx`, `home-calendar.css` | Classic card: border + `radius-md` + `elevation-paper-1`. Title **inside** the box. |
| Home widgets | `HomePage.jsx`, `.home-stat-card` | Nested cards inside `SectionCard`; muted fill, still card-shaped. |
| Lists | `RecordListLayout.jsx`, `RecordTable`, `data-lists.css` | Table wrap = bordered surface + paper shadow; row dividers edge-to-edge. |
| Clinical flat sections | `clinical.css` `.card` | Already flatter (no box shadow); left accent on titles. Closer to tray intent, still not recessed wells. |
| Overlays | `FormOverlay.jsx`, `overlays-editor.css` | Heavy drop shadow (`0 24px 48px`) + thick primary header rule. |
| Workspace | `LayoutComponents.jsx` (`room-*`) | Split panes, sticky bars, paper elevation for clinical sheets. |
| Inputs | `.paper-input` | Surface fill + focus ring glow (`0 0 0 3px`). |

### 1.4 Friction map (current → tray)

| # | Current pattern | Tray conflict |
|---|-----------------|---------------|
| F1 | `.section-card` / `.record-table-wrap` float with `elevation-paper-1` | Depth via drop shadow instead of recessed tone |
| F2 | Radii 6 / 8 / 12 used freely on nested boxes | Visual pinching; no `R_inner = R_outer − padding` |
| F3 | Section titles live inside bordered cards | Need **external overhead labels** outside the tray |
| F4 | Table / list dividers span full width | Need **indented dividers** aligned to text baseline |
| F5 | App shell is flat canvas + flush sidebar | Need **unibody bezel**: outer chassis holding nav + recessed main tray |
| F6 | Page header left accent bar; card left borders | Decorative SaaS chrome; tray prefers milled edges / hairlines |
| F7 | `FormOverlay` and bulk bars use large soft shadows | Floating modal language; tray modals should be inset panels or light islands |
| F8 | Filters / toolbars are rectangular strips | High-frequency controls should become **docked pills / islands** |
| F9 | Dual CSS: large BEM surface area + partial Tailwind | Migration must be token-first, then primitive components, then page adoption |
| F10 | Mobile already strips some card chrome (`base.css` ≤640px) | Good precedent: flatten float → treat as intentional path toward trays |
| F11 | Somatic / reading-contrast themes remap `--bg-*` | New surface tokens must map through themes, not hard-code cream |
| F12 | Clinical "paper" (`room-clinical-paper`, editor sheet) legitimately elevates | **Exception:** document sheets may keep paper elevation; do not force tray language onto immersive writing surfaces |

---

## Step 2 — Design token & utility strategy

All additions go in `src/styles/tokens.css` (and thin `@utility` helpers). Bridge new colours into `@theme` so Tailwind classes like `bg-surface-tray` work.

### 2.1 Surface stratification

Semantic stack (outer → inner), tone-on-tone:

```
surface-base     → page / viewport canvas (current --bg-canvas)
surface-bezel    → outer chassis / sidebar frame (slightly darker or cooler than base)
surface-tray     → primary recessed content well (current --bg-surface or a hair darker than base)
surface-inset    → nested well inside a tray (lists, empty states, code-like blocks)
surface-raised   → rare: docked pill / island only (not cards)
```

**Proposed tokens** (practice theme; other themes override via existing `[data-theme]` blocks):

```css
:root,
[data-theme='practice'] {
  /* Hardware surfaces — tone steps, not elevation */
  --surface-base: var(--bg-canvas);
  --surface-bezel: color-mix(in srgb, var(--bg-canvas) 88%, var(--text-primary) 12%);
  --surface-tray: var(--bg-surface);
  --surface-inset: color-mix(in srgb, var(--bg-muted) 85%, var(--bg-canvas) 15%);
  --surface-raised: var(--bg-surface);

  /* Hairline borders (monochrome opacity preferred over new hex) */
  --edge-hairline: color-mix(in srgb, var(--text-primary) 12%, transparent);
  --edge-hairline-strong: color-mix(in srgb, var(--text-primary) 18%, transparent);
  --edge-inset-highlight: color-mix(in srgb, #ffffff 55%, transparent);

  /* Milled edge (inset highlight + soft recess) — no drop shadow */
  --edge-milled: inset 0 1px 0 var(--edge-inset-highlight),
                 inset 0 0 0 1px var(--edge-hairline);
  --edge-recessed: inset 0 1px 1px color-mix(in srgb, var(--text-primary) 8%, transparent),
                   inset 0 0 0 1px var(--edge-hairline);
}
```

`@theme` bridge:

```css
@theme {
  --color-surface-base: var(--surface-base);
  --color-surface-bezel: var(--surface-bezel);
  --color-surface-tray: var(--surface-tray);
  --color-surface-inset: var(--surface-inset);
  --color-surface-raised: var(--surface-raised);
  --color-edge: var(--edge-hairline);
  --color-edge-strong: var(--edge-hairline-strong);
}
```

Deprecate (gradually): direct use of `--elevation-paper-1…4` on chrome. Keep paper elevation **only** for `room-clinical-paper` / editor sheet / print-like surfaces (F12).

### 2.2 Concentric radius system

Define a **padding ladder** and derived radii:

```css
:root {
  /* Outer chassis / large trays */
  --radius-bezel: 20px;
  --pad-bezel: 8px;          /* gap between bezel and tray */
  --radius-tray: calc(var(--radius-bezel) - var(--pad-bezel)); /* 12px */

  /* Nested inset inside tray */
  --pad-tray: 12px;
  --radius-inset: calc(var(--radius-tray) - var(--pad-tray)); /* 0 if pad ≥ tray — clamp */

  /* Control / field */
  --radius-control: 8px;
  --radius-pill: 999px;

  /* Legacy aliases during migration */
  --radius-sm: 6px;
  --radius-md: var(--radius-control);
  --radius-lg: var(--radius-tray);
}
```

**Rule:** Whenever nesting rounded containers, authors must set:

`border-radius: calc(var(--parent-radius) - var(--padding))`

with a floor of `0` (or prefer squircle utilities below). Provide utilities:

```css
@utility radius-concentric {
  /* parent sets --_r and --_p; child uses this */
  border-radius: max(0px, calc(var(--_r, var(--radius-tray)) - var(--_p, var(--pad-tray))));
}

@utility radius-squircle {
  /* Progressive enhancement: continuous corners where supported */
  corner-shape: squircle;
  border-radius: var(--radius-tray);
}
```

Until `corner-shape` is broadly reliable, use `border-radius` as the source of truth and treat squircle as progressive enhancement (Safari / Chromium experiments). Do not block the refactor on G2 continuity.

**Standard nest recipes**

| Parent | Padding | Child radius |
|--------|---------|--------------|
| Bezel `20` | `8` | Tray `12` |
| Tray `12` | `12` | Inset `0` (square well) or reduce pad to `4` → inset `8` |
| Tray `16` | `4` | Inset `12` |
| Pill island | n/a | `999px` (exempt from concentric formula) |

### 2.3 Edge / bezel utilities

```css
@utility edge-hairline {
  border: 1px solid var(--edge-hairline);
}

@utility edge-milled {
  border: 1px solid var(--edge-hairline);
  box-shadow: var(--edge-milled);
}

@utility edge-recessed {
  border: 1px solid var(--edge-hairline);
  box-shadow: var(--edge-recessed);
}

@utility tray-panel {
  background: var(--surface-tray);
  border: 1px solid var(--edge-hairline);
  border-radius: var(--radius-tray);
  box-shadow: var(--edge-recessed);
}

@utility tray-inset {
  background: var(--surface-inset);
  border: 1px solid var(--edge-hairline);
  border-radius: var(--radius-inset);
  box-shadow: var(--edge-recessed);
}

@utility divider-indented {
  border: 0;
  border-bottom: 1px solid var(--edge-hairline);
  margin-inline: var(--pad-tray);
}

@utility island-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  border: 1px solid var(--edge-hairline);
  box-shadow: none;
}
```

### 2.4 Component primitives (thin React wrappers)

Introduce once tokens exist (Phase A/B), colocated with existing layout components:

| Primitive | Responsibility |
|-----------|----------------|
| `<AppBezel>` | Outer chassis padding + `surface-bezel` |
| `<ViewportTray>` | Main recessed canvas wrapping `<Outlet />` |
| `<TrayPanel>` | Replaces visual role of `.section-card` body |
| `<TrayLabel>` | Overhead label + optional `HelpTip` **outside** the panel |
| `<InsetWell>` | Nested recessed region (stats, empty states) |
| `<IslandPill>` / `<CommandIsland>` | Filters, quick actions, bulk bars |

Keep `SectionCard` API stable initially; restyle internals to overhead label + tray body so call sites do not churn.

---

## Step 3 — Phased refactoring plan

### Phase A — Foundation (tokens, no visual rewrite)

**Goals**

1. Add surface / edge / concentric radius tokens and `@theme` bridges.
2. Map every `[data-theme='…']` block so accessibility themes (especially `reading-contrast`) still work.
3. Set `--elevation-paper-*` consumers for chrome on a denylist; document the clinical-paper exception.
4. Add Story-less smoke: a single `/dev` or internal preview page is optional; prefer Vitest snapshot of computed CSS variables if useful later.

**Non-goals:** Changing `AppLayout` or Home yet.

**Acceptance**

- New utilities compile under Tailwind v4.
- Existing UI unchanged (tokens only alias current values where needed, or feature-flag via `[data-chrome='tray']` if opt-in is preferred).

**Recommended opt-in flag** for safe rollout:

```html
<html data-chrome="legacy">  <!-- default -->
<html data-chrome="tray">    <!-- enable new surfaces -->
```

Toggle in Settings → Account (or a temporary query param during development).

---

### Phase B — App shell & viewport bezel

**Before** (`base.css` / `AppLayout.jsx` conceptual structure):

```jsx
<div className="app-shell">
  <header className="top-nav">…</header>
  <main className="main-content">
    <Outlet />
  </main>
</div>
```

```css
.app-shell { min-height: 100dvh; display: flex; background: var(--bg-page); }
.top-nav { width: var(--nav-width); background: var(--bg-nav); border-right: 1px solid var(--border-color); }
.main-content { flex: 1; background: var(--bg-page); }
```

**After** (tray chassis):

```jsx
<div className="app-shell app-shell--tray" data-chrome="tray">
  <div className="app-bezel">
    <header className="top-nav top-nav--tray">…</header>
    <main className="main-content main-content--tray">
      <div className="viewport-tray">
        <Outlet />
      </div>
    </main>
  </div>
</div>
```

```css
[data-chrome='tray'] .app-shell--tray {
  background: var(--surface-base);
  padding: var(--pad-bezel);
}

[data-chrome='tray'] .app-bezel {
  display: flex;
  flex: 1;
  min-height: 0;
  background: var(--surface-bezel);
  border-radius: var(--radius-bezel);
  border: 1px solid var(--edge-hairline);
  box-shadow: var(--edge-milled);
  overflow: hidden;
}

[data-chrome='tray'] .top-nav--tray {
  background: transparent;
  border-right: 1px solid var(--edge-hairline);
  box-shadow: none;
}

[data-chrome='tray'] .viewport-tray {
  flex: 1;
  min-width: 0;
  background: var(--surface-tray);
  border-radius: var(--radius-tray);
  /* concentric: radius-bezel − pad between bezel inner edge and tray */
  margin: var(--pad-bezel);
  box-shadow: var(--edge-recessed);
  border: 1px solid var(--edge-hairline);
  overflow: auto;
}
```

**Page mast:** Retire the left gradient accent bar under tray mode; keep title typography. Optional slim hairline under `.page-header` only.

**Mobile:** On ≤900px, keep drawer nav; bezel padding can collapse to `4px` so usable width is preserved.

---

### Phase C — Dashboard grid & trays

Primary targets: `HomePage`, `SectionCard`, `.home-stat-card`, `.home-upcoming-timeline`, practice dashboards using `section-card-stack`.

**Before** (`SectionCard` + styles):

```jsx
<section className="section-card">
  <header className="section-card__header">
    <h2 className="section-card__title">{heading}</h2>
    …
  </header>
  <div className="section-card__body">{children}</div>
</section>
```

```css
.section-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--elevation-paper-1);
}
```

**After** (overhead label + recessed tray; API preserved):

```jsx
<section className="section-card section-card--tray" aria-labelledby={…}>
  <header className="section-card__header section-card__header--overhead">
    <div className="section-card__heading">
      <div className="section-card__title-row">
        <h2 id={…} className="section-card__title">{heading}</h2>
        {helpText ? <HelpTip … /> : null}
      </div>
    </div>
    {actions && <div className="section-card__actions">{actions}</div>}
  </header>
  {toolbar && (
    <div className="island-pill section-card__toolbar-island" role="toolbar">
      {toolbar}
    </div>
  )}
  <div className="section-card__tray">{children}</div>
</section>
```

```css
[data-chrome='tray'] .section-card--tray {
  border: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}

[data-chrome='tray'] .section-card__header--overhead {
  padding: 0 0 0.5rem;
  /* label sits outside the tray */
}

[data-chrome='tray'] .section-card__tray {
  background: var(--surface-inset);
  border: 1px solid var(--edge-hairline);
  border-radius: var(--radius-tray);
  box-shadow: var(--edge-recessed);
  padding: var(--pad-tray);
}

[data-chrome='tray'] .home-stat-card {
  background: var(--surface-tray);
  border: 1px solid var(--edge-hairline);
  border-radius: var(--radius-inset); /* concentric with tray padding */
  box-shadow: none;
}
```

**Home grid:** Stats become inset wells inside one clinician tray; upcoming timeline uses indented dividers / hairline separators rather than nested card chrome.

**Record tables:**

```css
[data-chrome='tray'] .record-table-wrap {
  background: var(--surface-tray);
  box-shadow: var(--edge-recessed);
  border-color: var(--edge-hairline);
  border-radius: var(--radius-tray);
}

[data-chrome='tray'] .record-table td,
[data-chrome='tray'] .record-table th {
  border-bottom-color: var(--edge-hairline);
}

/* Indent horizontal rules to content inset */
[data-chrome='tray'] .record-table th:first-child,
[data-chrome='tray'] .record-table td:first-child {
  padding-left: var(--pad-tray);
}
[data-chrome='tray'] .record-table th:last-child,
[data-chrome='tray'] .record-table td:last-child {
  padding-right: var(--pad-tray);
}
```

---

### Phase D — Component micro-surfaces

| Component | Change |
|-----------|--------|
| `.paper-input` | Inset well (`surface-inset` + `edge-recessed`); focus = hairline + soft inset, not large outer glow |
| Badges / status pills | Already near-pill; standardise on `island-pill` / `rounded-full` with hairline |
| `BulkStatusBar` / notes bulk bar | Convert from floating bar with heavy shadow to bottom **command island** (`rounded-full`, hairline) |
| `FormOverlay` | Reduce to hairline + recessed panel; backdrop stays dimmed; drop `0 24px 48px` shadow |
| `DialogProvider` | Same as overlay |
| `top-nav__link--active` | Prefer recessed pill in the rail over filled rectangle + right border |
| Filters in `page-header__toolbar` | Group into `CommandIsland` |
| Calendar blocks | Keep modality pigments; soften outer float; optional inset selection well |
| Toasts | Small island, hairline, no large shadow |

**Input before / after**

```css
/* Before */
.paper-input {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
}
.paper-input:focus {
  box-shadow: 0 0 0 3px var(--col-primary-light);
}

/* After (tray mode) */
[data-chrome='tray'] .paper-input {
  background: var(--surface-inset);
  border: 1px solid var(--edge-hairline);
  border-radius: var(--radius-control);
  box-shadow: var(--edge-recessed);
}
[data-chrome='tray'] .paper-input:focus {
  border-color: color-mix(in srgb, var(--col-primary) 45%, var(--edge-hairline));
  box-shadow: var(--edge-recessed), 0 0 0 2px var(--col-primary-light);
}
```

---

## Sequencing & risk

```
Phase A (tokens + flag)
    ↓
Phase B (shell bezel)     ← highest user-visible risk; ship behind flag
    ↓
Phase C (Home + SectionCard + RecordTable)
    ↓
Phase D (inputs, overlays, pills, bulk bars)
```

**Do not tray-ify (initially)**

- Immersive `DocumentWorkspace` / clinical paper sheets
- Auth marketing screens (separate surface language)
- Print / PDF export CSS
- `reading-contrast` theme: keep high-contrast borders; map tray tokens to black/white rules already defined

**Regression checklist**

- [ ] Somatic themes still remap surfaces
- [ ] Mobile drawer nav + bezel padding
- [ ] FormOverlay focus trap / scroll lock unchanged
- [ ] RecordTable sticky headers still work inside recessed wrap
- [ ] Progress-notes immersive layout still full-bleed inside viewport tray

---

## File touch map (implementation)

| Phase | Files |
|-------|-------|
| A | `src/styles/tokens.css`, optionally `src/styles/tray.css` imported from `index.css` |
| B | `src/components/AppLayout.jsx`, `src/styles/base.css`, theme toggle / settings if flag is user-facing |
| C | `src/components/SectionCard.jsx`, `src/styles/home-calendar.css`, `src/features/home/HomePage.jsx`, `src/styles/data-lists.css`, practice pages using `SectionCard` |
| D | `src/styles/clinical.css` (inputs), `src/styles/overlays-editor.css`, `src/components/BulkStatusBar.jsx`, dialog/toast providers |

---

## Success criteria

1. **No chrome drop shadows** under `data-chrome="tray"` except clinical paper and true transient floating UI (menus) if absolutely required.
2. **Concentric radii** verified on App bezel → viewport tray → section tray → inset wells.
3. **Section labels** sit outside trays; internal dividers indent to content.
4. **High-frequency actions** (filters, bulk, theme utilities) read as pills / islands.
5. Brand colour, type, and UK copy conventions unchanged.
6. Legacy mode remains available until tray is the default.

---

## Appendix — Quick reference formula

```
Radius_inner = max(0, Radius_outer − Padding)
Depth        = tone step + 1px hairline + optional inset highlight
Never        = soft multi-stop drop shadow on structural chrome
Exempt       = clinical paper sheets, true menus/popovers (minimal), pills (full round)
```
