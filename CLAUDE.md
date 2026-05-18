# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — runs the kubectl-backed API (`scripts/kuber-api.mjs`) and `ng serve` together. The UI expects the API on `http://127.0.0.1:4201` and itself runs on `http://127.0.0.1:4200`.
- `npm start` — Angular dev server only (no API; the UI will show a load error until `npm run api` is also running).
- `npm run api` — API only. Env overrides: `KUBER_VIEW_API_PORT` (default 4201), `KUBER_VIEW_KUBECTL_TIMEOUT_MS` (default 9000).
- `npm run build` / `npm run watch` — production / dev `ng build`.
- `npm test` — Vitest via `@angular/build:unit-test`. Run a single test with `npx ng test --test-name-pattern "<regex>"`.

The API shells out to `kubectl` against whatever context is currently active (originally targeted at a local minikube cluster). If `kubectl` cannot reach the cluster, `/api/snapshot` returns 500 with a `hint` field that the UI surfaces in the error banner.

## Architecture

Two-process app: an Angular 21 single-page UI and a small Node HTTP server that wraps `kubectl`. There is no shared types package — the API JSON shape and the TypeScript interfaces in `src/app/app.ts` must be kept in sync by hand.

### API (`scripts/kuber-api.mjs`)

A plain `node:http` server (no framework) exposing three endpoints, all locked to `127.0.0.1` with CORS pinned to `http://127.0.0.1:4200`:

- `GET /api/health` — liveness.
- `GET /api/snapshot` — fans out ~10 `kubectl` calls in parallel (`get namespaces|pods|nodes|deploy,statefulset,daemonset,job|svc|events`, `top pods|nodes`, plus optional CRDs `upfpools.core.5g3e.io` and `upfscalingdecisions.core.5g3e.io`) and assembles a single `ClusterSnapshot`. Also tails ~28 log lines for a curated set of pods (`pickLogPods`, biased toward `open5gs-*`, `upf-autoscaler`, `oai`, `ue` in the `o5gs-dev` namespace).
- `GET /api/logs?namespace=&pod=&tail=` — per-pod log fetch with prefix/timestamps.

Health is derived (not from kubectl): `podStatus` classifies waiting/terminated containers as `Critical`, restart counts or not-ready as `Warning`, otherwise `Healthy`; `workloadHealth` compares `readyReplicas` to `spec.replicas`. CPU/memory parsing in `parseCpu`/`parseMemory` normalizes kubectl's `n`/`u`/`m` and `Ki`/`Mi`/`Gi` suffixes to millicores and MiB.

Optional `kubectl` calls (`{ optional: true }`) swallow errors so missing CRDs or a disabled metrics-server don't take down the whole snapshot — they produce empty arrays/strings instead.

### UI (`src/app/app.ts`)

Single root component `App`, no child components, no routes (`app.routes.ts` is empty). All view state lives in signals on `App`; derived rows go through `computed()`. The component owns:

- A 10-second `interval()` auto-refresh wrapped in `takeUntilDestroyed()`, gated on the `autoRefresh` signal.
- A pod "inspector" with `openedPodKeys` + `activePodKey`. Layout flips from `split` to `tabs` automatically when more than 3 pods are open (`effectiveInspectorMode`).
- Per-pod log cache `podLogs` keyed by `namespace/name`; `pruneClosedPods` drops keys that disappear from the latest snapshot.

If you add features, prefer new computed signals over methods called from the template — methods re-run on every change detection cycle even under `OnPush`.

### Styling

Tailwind v4 via `@tailwindcss/postcss` (see `.postcssrc.json`). `src/styles.css` is the global entry; per-component styles live in `app.css`. The production budget caps `anyComponentStyle` at 18 kB — `app.css` is already close to that limit, so add new styles judiciously.

## Project conventions

From `.cursor/rules/cursor.mdc` and `AGENTS.md` (identical content; treat as authoritative):

- Standalone components only. Do **not** write `standalone: true` — it's the v20+ default.
- Signals for state; `computed()` for derived state; never call `.mutate()` on a signal (`update`/`set` only).
- `ChangeDetectionStrategy.OnPush` on every `@Component`.
- `inject()` instead of constructor injection; services use `providedIn: 'root'`.
- `input()`/`output()` functions, not the decorators. Host bindings go in the `host` object, not `@HostBinding`/`@HostListener`.
- Templates use native control flow (`@if`, `@for`, `@switch`) — no `*ngIf`/`*ngFor`. No arrow functions in templates. Use `class`/`style` bindings, not `ngClass`/`ngStyle`.
- Avoid `any`; use `unknown` when the type is genuinely uncertain.
- Accessibility: WCAG AA, must pass AXE.
