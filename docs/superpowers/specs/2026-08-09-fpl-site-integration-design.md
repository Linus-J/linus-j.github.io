# FPL bot → portfolio site integration

**Date:** 2026-08-09
**Repos:** `Linus-J/linus-j.github.io` (site) and `Linus-J/FPL-26-27-bot` (bot)
**Source brief:** `~/Downloads/fpl-site-integration-prompt.md`

## Goal

Add a `$ fpl status` section to the portfolio site showing the bot's current squad, top-15 players by xPts, and squad/transfer/chip history — sourced live from the bot repo via static JSON, no manual copying, no backend server, no build step on the site. Visually it's meant to be the standout piece of the site (pitch view, Monte Carlo uncertainty visuals, animated transitions), while staying within the site's minimalist dark terminal aesthetic. It's also the first instance of a reusable "stats panel" pattern for future Brighton/Knicks/England panels (not built now, but not painted into a corner either).

## Architecture overview

```
FPL-26-27-bot (run manually by you, each gameweek, on your machine)
  run_weekly.py / run_agent.py --dry-run   (existing: ingest + project + optimise, decision_log)
  → you review the decision, overrule anything obviously wrong
  → uv run python scripts/export_site_data.py    (new: query DB → write data/simulations/{gw}.json
                                                    + index.json → git commit + push)

                    ↓ (jsDelivr GH proxy, CORS + caching)

linus-j.github.io (static, vanilla JS, no build step)
  stats-panel.js (generic engine)  fetch index → <select> → fetch run → render → animate
  panels/fpl.js (thin config + renderer, uses charts/distribution.js, charts/timeline.js)
```

No backend, no server-side code anywhere, and **no GitHub Actions/CI automation** — the pipeline stays a manual, human-in-the-loop step you run yourself before each gameweek deadline (this is deliberate: it's why the systemd timer was disabled in the first place). Only the export/sync step is new automation, and even that is a command *you* trigger once you're happy with the result, not something that runs unattended.

---

## Part 1 — Bot repo (`FPL-26-27-bot`)

### 1.1 Export script: `scripts/export_site_data.py`

A standalone script, run manually by you *after* `run_agent.py --dry-run` (or `run_weekly.py`) and *after* you've reviewed/overruled the decision — not folded into `run_agent.py` itself, and not triggered automatically by anything. You run it once you're satisfied the decision_log reflects what you actually want live on the site.

Reuses existing query logic rather than duplicating it:
- Squad + starting XI + captain/bench: same approach as `dashboard/data/squad.py::get_current_squad`
- History (transfers/chips/lineup changes): same approach as `dashboard/data/decisions.py::get_decision_history`
- Top 15 by xPts: `player_projections` for the current gameweek, sorted by `xpts_mean` descending, capped at 15
- Per-player distribution summary: aggregate `projection_samples` for that player/gameweek into `{p10, median, mean, p90}` (5 numbers, not the ~100 raw draws)

Output is written via a shared `_write_run(gw, payload)` helper that also updates `index.json` (append-or-replace the entry for that GW, keep list sorted by GW descending).

After writing both files, the script runs `git add data/simulations`, commits (`export: GW{n} site data`), and pushes — scoped only to that directory, so it can never accidentally sweep up unrelated local changes. It prints a diff summary (files changed, byte sizes) before committing, and supports `--no-push` for a dry run that writes + commits locally without pushing, so you can inspect the result first if you want to.

### 1.2 JSON schema

`data/simulations/{gw}.json` (filename e.g. `gw3.json`):

```json
{
  "schema_version": 1,
  "gameweek": 3,
  "label": "GW3 — 3 Aug",
  "generated_at": "2026-08-03T06:05:00Z",
  "squad": [
    {
      "player_id": 142, "web_name": "Haaland", "position": "FWD",
      "team_short": "MCI", "now_cost": 15.1,
      "is_starting": true, "is_captain": true, "is_vice_captain": false,
      "bench_order": null,
      "xpts": {"mean": 8.2, "p10": 3.1, "median": 7.9, "p90": 13.4}
    }
  ],
  "top15": [
    {"player_id": 142, "web_name": "Haaland", "position": "FWD", "team_short": "MCI",
     "xpts": {"mean": 8.2, "p10": 3.1, "median": 7.9, "p90": 13.4}}
  ],
  "history": [
    {"gameweek": 3, "type": "transfers", "transfers_in": ["Haaland"], "transfers_out": ["Wilson"],
     "hits_taken": 0, "net_xpts_gain": 1.4},
    {"gameweek": 3, "type": "chip", "chip": "wildcard", "reason": "..."}
  ]
}
```

- `web_name`/`team_short`/`position` are denormalized directly into the run file (not just IDs) so each file is self-contained — the site never cross-references a separate players table.
- Scope is deliberately minimal: no injury/fixture info on player entries (confirmed out of scope), no raw per-simulation draws (confirmed out of scope) — just the 4-number distribution summary per player.
- `schema_version` lets the site's generic loader (Part 2) detect a breaking shape change later without guessing.

`data/simulations/index.json`:
```json
{"schema_version": 1, "runs": [{"id": "gw3", "gameweek": 3, "label": "GW3 — 3 Aug", "generated_at": "..."}]}
```
Sorted most-recent-first. The site fetches only this file up front, then fetches individual run files on demand when the user picks one from the dropdown.

### 1.3 Weekly routine (local, manual — no GitHub Actions)

No `.github/workflows/` file for this feature. The full loop is:

```bash
uv run python scripts/run_weekly.py --dry-run     # (or run_agent.py) — as today
# → you review the decision in the dashboard/logs, manually override anything
#   obviously wrong via the FPL app / decision_log as you already do
uv run python scripts/export_site_data.py         # writes data/simulations/{gw}.json +
                                                    # index.json, commits, pushes
```

This is a deliberate simplification from the original brief's "GitHub Actions cron" idea: the decision-making run itself stays a manual, reviewed step on your machine (matching why the systemd timer is disabled), and the only new automation is the export/sync — which you also trigger yourself, once, after review. No pipeline runs unattended, no FPL/odds/Guardian credentials ever need to exist as CI secrets, and there's no ephemeral-CI-database problem to design around — `export_site_data.py` just reads whatever is currently in your local `fpl_bot_v2.db`, which already reflects your reviewed/overruled decision.

- **Scope:** covers only the pre-deadline decision moment (squad/transfers/chips as locked in by the run you just reviewed). No post-GW backfill/actual-vs-projected step — confirmed out of scope; can be added later without a schema break since `history` entries are additive.
- **Credentials:** none needed beyond what already exists in your local `.env` — nothing new to configure.

### 1.4 Long-term hygiene

Not built now, but the schema doesn't block it:
- `index.json` entries carry `gameweek`, so a future site-side filter can cap the dropdown to the current season without a schema change.
- Rolling early-season runs into a single archive file is possible later by adding an `"archived": true` + `"archive_url"` pair to an index entry — additive, no breaking change to consumers.

---

## Part 2 — Site repo (`linus-j.github.io`)

### 2.1 Reusable stats-panel architecture

```
assets/
  stats-panel.js        generic engine: build jsDelivr URL, fetch index → populate <select>,
                         fetch run on change → call panel.renderRun(container, run, prevRun),
                         loading/error states, schema_version guard
  stats-panel.css        shared section header, loading/error states, uncertainty color
                         semantics (reuses existing --teal/--orange/etc. accent vars)
  charts/
    uplot.min.js          vendored, self-hosted (no CDN — matches the site's existing
                           subset-and-self-host approach for fonts)
    distribution.js        generic error-bar component (uPlot wrapper): p10–p90 whisker + mean dot
    timeline.js             generic vertical event-log component
  panels/
    fpl.js                 FPL-specific: pitch-free "grouped position rows" squad renderer,
                            config = {repo: "Linus-J/FPL-26-27-bot", path: "data/simulations"}
```

`stats-panel.js` owns the generic fetch → parse → render → animate pipeline and knows nothing about FPL specifically. A panel module supplies only: its data-source config (repo/path) and a `renderRun(container, run, prevRun)` function. Adding a Brighton panel later means writing `panels/brighton.js` + one more `<section>` in HTML — no changes to the shared engine.

`docs/stats-panel-schema.md` documents the JSON contract (schema_version, required top-level fields, what's generic vs FPL-specific) so future model outputs (Brighton/Knicks/England) know what shape to conform to — note that `squad`/`top15`/`history` are FPL-specific field *names*, but the shared engine only requires `schema_version`, an array-shaped section per visual component, and `xpts`-style `{mean, p10, median, p90}` objects wherever a distribution component is used. The doc calls this out explicitly so a future panel author knows what's contractual vs FPL naming.

### 2.2 Display panel: `$ fpl status`

New page or section (matching `$ whoami` / `$ neofetch` voice) fetching `index.json` on load, populating a `<select>` of past runs (most recent selected by default), re-rendering on change.

**Squad view — grouped position rows** (confirmed via mockup, over a spatial pitch layout): sections labelled Forwards/Midfielders/Defenders/Goalkeeper/Bench, each a `.term-panel`-styled card row. Captain visually marked (orange border + badge, consistent with the site's existing `--orange` accent). This layout reads cleanly, fits arbitrary squad sizes without spatial cramming, and degrades naturally on mobile (rows just wrap) — the deciding factor over the spatial pitch option in the mockup review.

**xPts uncertainty — error bar** (confirmed via mockup, over density sparkline / gradient band): a p10–p90 whisker line with end caps and a mean-value dot, drawn via uPlot, one per player card. Chosen for honesty (represents exactly the 4 summary numbers with no interpolated shape) and cheap rendering/animation cost.

**History — vertical git-log-style timeline** (confirmed via mockup, over horizontal GW scrubber): reverse-chronological list, connecting rail, colored dot per event type (transfer/chip/lineup), most recent first. Chosen for readability without requiring hover/tap interaction to see event detail, and because it fits the site's existing dev-portfolio voice (reads like a changelog).

**Switch-simulation transitions:** players keyed by `player_id` across runs. Continuing players animate position/value changes in place (FLIP-style transform transition); players leaving the squad fade+scale out, entering players fade+scale in. Respects `prefers-reduced-motion` (transitions become instant), consistent with the site's existing `@media (prefers-reduced-motion: reduce)` block.

**Graceful degradation:** if `fetch()` fails (network error, jsDelivr outage) or JS doesn't execute, the section falls back to a static message + a link to the bot repo — no broken half-rendered UI. A `<noscript>` block covers the no-JS case specifically. A successfully-fetched but empty `index.json` (`"runs": []` — before the first export has ever been pushed) is a distinct third state: the site shows a "no runs yet" message rather than treating it as an error.

**Mobile:** grouped-row squad layout wraps naturally; error-bar cards and timeline entries stack to full width under the same breakpoint pattern already used by `.card`/`.card-grid` (560px).

---

## Testing / verification plan

- Bot repo: `export_site_data.py` gets a unit test with a seeded in-memory DB asserting schema shape (required keys present, `xpts` objects have all 4 fields, JSON is valid and under a few KB for a realistic squad).
- Bot repo: manually run `export_site_data.py --no-push` once against real local data to sanity-check the JSON output before ever letting it push.
- Site repo: manual verification against the real jsDelivr URLs once at least one real run has been pushed — check index fetch, run fetch, dropdown switch animation, and the offline/error fallback (simulate by fetching a bad URL).
- No automated site tests exist currently (static site, no test suite) — consistent with existing project conventions, not introducing a test framework for this feature alone.

## Out of scope (explicitly)

- Post-GW backfill (actual vs projected) export — pre-deadline only, per confirmed scope.
- Injury status / next-fixture fields on squad entries — confirmed minimal schema.
- Brighton / Knicks / England panels — pattern must support them later, but they are not built now.
- Any change to the live (non-dry-run) decision/submission path — untouched by this work.
- **Any GitHub Actions / CI automation for the bot pipeline** — the decision run stays manual and human-reviewed each gameweek; only the export/sync step is new, and it too is manually triggered, never scheduled or run unattended.
