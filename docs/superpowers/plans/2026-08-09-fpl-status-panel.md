# FPL Status Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `$ fpl status` page — a new dedicated page on the static portfolio site that fetches the FPL bot's exported JSON (via jsDelivr) and renders the current squad (grouped position rows), a top-15 xPts comparison chart with uncertainty error bars, and a transfer/chip history timeline, with an animated switch-between-gameweeks dropdown — built as the first instance of a reusable "stats panel" pattern for future sport panels.

**Architecture:** A generic `stats-panel.js`/`stats-panel.css` engine (fetch index → populate `<select>` → fetch run → hand off to a panel's `renderRun`) with two generic chart components (`charts/distribution.js`, `charts/timeline.js`), consumed by a thin FPL-specific panel module (`panels/fpl.js`/`panels/fpl.css`). No build step, no framework — plain `<script>` tags, matching the rest of the site.

**Tech Stack:** Vanilla HTML/CSS/JS, vendored uPlot 1.6.32 (MIT, self-hosted, ~51KB unminified/~15KB gzipped) for the top-15 comparison chart. No other dependencies.

**Companion spec:** `docs/superpowers/specs/2026-08-09-fpl-site-integration-design.md` (Part 2). The bot-repo half of this feature has its own separate plan in `FPL-26-27-bot/docs/superpowers/plans/2026-08-09-site-export.md`.

**Verification approach:** This repo has no test framework and no build step (confirmed deliberate — see the design spec's testing plan). Every task below is verified with a throwaway Playwright script run via `uvx --with playwright python3 <script>.py` against a local `python3 -m http.server`, checking real rendered DOM state and console/page errors — not framework unit tests, but real automated checks, not just eyeballing. All of this plan's code was built and verified this way before being written down here (uPlot chart config confirmed against real Context7-fetched uPlot 1.6.32 docs and a real headless-Chromium render — screenshots matched the approved mockups exactly, including the switch-run animation actually swapping DOM and marking new/changed players).

## Global Constraints

- No build step, no bundler, no npm — every asset is a plain file referenced by a `<script>`/`<link>` tag, matching the rest of the site.
- No new external runtime dependencies beyond vendored, self-hosted uPlot — no CDN script tags (matches the site's existing font-subsetting/self-hosting practice).
- Fonts are out of scope — do not change font families or add typefaces anywhere in this work.
- Reuse the site's existing CSS custom properties (`--bg`, `--bg-panel`, `--teal`, `--orange`, `--blue`, `--fg-dim`, `--mono`, etc. from `assets/style.css`) rather than introducing new color values.
- All data-driven text (player names, chip reasons, transfer names) must be inserted via `textContent`/`createTextNode`, never raw string-interpolated `innerHTML` — the bot repo's export is a separate automated pipeline, so treat its JSON as external input even though it's self-authored.
- Respect `prefers-reduced-motion: reduce` for every animation/transition introduced (matches the site's existing `.cursor`/`.card` reduced-motion handling).
- **One-time environment setup for verification scripts:** `uvx --with playwright playwright install chromium` (downloads ~300MB once; already confirmed working in this environment). Every task's Playwright check script below assumes chromium is installed.
- **Test fixtures live outside the repo**, in a scratch directory (e.g. `/tmp/fpl-status-verify/`), not committed — this repo stays free of dev-only fixture JSON, consistent with its minimalist convention. Fixture-writing is a one-time setup step at the start of Task 3 (first task that needs real player data); later tasks reuse the same scratch fixtures.

---

## File Structure

```
assets/
  charts/
    uplot.iife.min.js    new — vendored uPlot 1.6.32
    uplot.min.css         new — vendored uPlot base CSS
    UPLOT-LICENSE.txt      new — vendored MIT license text
    distribution.js        new — renderWhisker (inline SVG) + renderTop15Chart (uPlot)
    timeline.js              new — generic vertical event-log renderer
  panels/
    fpl.js                  new — FPL config + renderRun + switch-run animation
    fpl.css                  new — FPL-specific squad/top15/history/animation layout
  stats-panel.js            new — generic fetch/select/render engine
  stats-panel.css            new — shared panel chrome, loading/error states

fpl-status.html              new — the $ fpl status page
index.html                   modified — add ~/fpl-status nav crumb
system.html                  modified — add ~/fpl-status nav crumb
contact.html                 modified — add ~/fpl-status nav crumb

docs/
  stats-panel-schema.md      new — JSON contract documentation
```

---

### Task 1: Vendor uPlot

**Files:**
- Create: `assets/charts/uplot.iife.min.js`
- Create: `assets/charts/uplot.min.css`
- Create: `assets/charts/UPLOT-LICENSE.txt`

**Interfaces:**
- Produces: a global `uPlot` constructor (IIFE bundle, attaches `window.uPlot`) and its base stylesheet, available to any later `<script src="assets/charts/uplot.iife.min.js">`.

- [ ] **Step 1: Fetch the pinned release**

Run:
```bash
cd /home/linus/Projects/linus-j.github.io
curl -s --max-time 15 https://unpkg.com/uplot@1.6.32/dist/uPlot.iife.min.js -o assets/charts/uplot.iife.min.js
curl -s --max-time 15 https://unpkg.com/uplot@1.6.32/dist/uPlot.min.css -o assets/charts/uplot.min.css
curl -s --max-time 15 https://unpkg.com/uplot@1.6.32/LICENSE -o assets/charts/UPLOT-LICENSE.txt
```
Expected: three files created.

- [ ] **Step 2: Verify the fetch**

Run: `wc -c assets/charts/uplot.iife.min.js assets/charts/uplot.min.css assets/charts/UPLOT-LICENSE.txt`
Expected: `uplot.iife.min.js` is ~51KB (51081 bytes when this plan was verified — a few hundred bytes of drift between patch releases is fine, but it should not be empty or a few hundred bytes, which would indicate a redirect/error page was saved instead of the real file). `uplot.min.css` ~1.8KB. `UPLOT-LICENSE.txt` non-empty and contains the word "MIT".

Run: `head -c 200 assets/charts/uplot.iife.min.js`
Expected: starts with `!function(` or similar minified JS, not `<html>` or `<!DOCTYPE` (which would mean curl saved an error page).

- [ ] **Step 3: Commit**

```bash
git add assets/charts/uplot.iife.min.js assets/charts/uplot.min.css assets/charts/UPLOT-LICENSE.txt
git commit -m "chore: vendor uPlot 1.6.32 for the FPL status panel's charts"
```

---

### Task 2: Shared and panel CSS

**Files:**
- Create: `assets/stats-panel.css`
- Create: `assets/panels/fpl.css`

**Interfaces:**
- Produces: class names consumed by Tasks 3–8: `.stats-panel`, `.stats-panel-header`, `.stats-panel-select`, `.stats-panel-body`, `.stats-panel-message`, `.whisker-line`, `.whisker-cap`, `.whisker-mean`, `.timeline-list`, `.timeline-row`, `.timeline-rail`, `.timeline-dot`, `.timeline-text`, `.timeline-gw`, `.timeline-empty` (all in `stats-panel.css` — generic, reusable by future panels); `.fpl-position-label`, `.fpl-position-list`, `.fpl-card`, `.fpl-card-top`, `.fpl-card-name`, `.fpl-card-meta`, `.fpl-card-whisker`, `.fpl-card-value`, `.fpl-section-heading`, `.fpl-top15`, `.fpl-history`, `.fpl-run`, `.fpl-run--entering`, `.fpl-run--leaving`, `.fpl-card--new`, `.fpl-card--changed` (all in `fpl.css` — FPL-specific).

- [ ] **Step 1: Create `assets/stats-panel.css`**

```css
/* ---------------- Stats panel: shared engine styles ---------------- */

.stats-panel {
	background: var(--bg-panel);
	border: 1px solid var(--line);
	border-radius: var(--radius);
	overflow: hidden;
	margin-top: 1.5rem;
	box-shadow: 0 12px 40px rgba(0,0,0,0.35);
}

.stats-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.9rem 1.1rem;
	background: var(--bg-panel-2);
	border-bottom: 1px solid var(--line);
	flex-wrap: wrap;
}
.stats-panel-header h2 {
	margin: 0;
	border: none;
	padding: 0;
	font-size: 1rem;
	color: var(--teal);
}

.stats-panel-select {
	font-family: var(--mono);
	font-size: 0.82rem;
	background: var(--bg-panel);
	color: var(--fg-dim);
	border: 1px solid var(--line);
	border-radius: 4px;
	padding: 0.3rem 0.6rem;
}
.stats-panel-select:hover { border-color: var(--line-bright); }

.stats-panel-body { padding: 1.1rem 1.1rem 1.4rem; position: relative; }

.stats-panel-message {
	color: var(--fg-faint);
	font-family: var(--mono);
	font-size: 0.88rem;
	text-align: center;
	padding: 2.5rem 1rem;
}
.stats-panel-message a { font-size: 0.85rem; }

/* ---------------- Distribution: whisker + chart ---------------- */

.fpl-card-whisker svg { width: 100%; height: 10px; display: block; }
.whisker-line, .whisker-cap { stroke: var(--teal); stroke-width: 1.2; }
.whisker-mean { fill: var(--orange); }

.fpl-top15-chart .u-legend { display: none; }

/* ---------------- Timeline ---------------- */

.timeline-list { display: flex; flex-direction: column; }
.timeline-row { display: flex; gap: 0.7rem; align-items: stretch; }
.timeline-rail { display: flex; flex-direction: column; align-items: center; }
.timeline-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.timeline-rail::after {
	content: "";
	display: block;
	width: 1px;
	flex: 1;
	background: var(--line);
	margin: 2px auto 0;
}
.timeline-row:last-child .timeline-rail::after { display: none; }
.timeline-text {
	font-family: var(--mono);
	font-size: 0.82rem;
	color: var(--fg-dim);
	padding-bottom: 0.9rem;
}
.timeline-gw { color: var(--blue); }
.timeline-empty { color: var(--fg-faint); font-family: var(--mono); font-size: 0.85rem; }
```

- [ ] **Step 2: Create `assets/panels/fpl.css`**

```css
/* ---------------- FPL panel: squad/top15/history layout ---------------- */

.fpl-position-label {
	font-family: var(--mono);
	font-size: 0.72rem;
	color: var(--teal);
	text-transform: uppercase;
	letter-spacing: 0.1em;
	margin: 1.1rem 0 0.5rem;
	border: none;
	padding: 0;
}
.fpl-position-label--bench { color: var(--fg-faint); }
.fpl-squad h3:first-child { margin-top: 0; }

.fpl-position-list { display: flex; gap: 0.6rem; flex-wrap: wrap; }

.fpl-card {
	background: var(--bg-panel-2);
	border: 1px solid var(--line);
	border-radius: 4px;
	padding: 0.5rem 0.65rem;
	min-width: 108px;
	flex: 1 1 108px;
	transition: border-color 0.15s ease;
}
.fpl-card--captain { border-color: var(--orange); }

.fpl-card-top {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 0.5rem;
	font-family: var(--mono);
	font-size: 0.74rem;
}
.fpl-card-name { color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fpl-card-meta { color: var(--fg-faint); flex-shrink: 0; }

.fpl-card-whisker { margin: 0.35rem 0; }

.fpl-card-value {
	font-family: var(--mono);
	font-size: 0.78rem;
	color: var(--teal);
}

.fpl-section-heading {
	font-family: var(--mono);
	font-size: 0.85rem;
	color: var(--blue);
	margin: 1.75rem 0 0.75rem;
	border: none;
	padding: 0;
}
.fpl-top15 { margin-top: 1.75rem; }
.fpl-history { margin-top: 1.75rem; }

@media (max-width: 560px) {
	.fpl-card { flex: 1 1 45%; }
}

/* ---------------- Switch-run transition ---------------- */

.fpl-run {
	transition: opacity 0.25s ease;
	opacity: 1;
}
.fpl-run--entering { opacity: 0; }
.fpl-run--leaving {
	opacity: 0;
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.fpl-card--new { animation: fpl-card-enter 0.4s ease; }
@keyframes fpl-card-enter {
	from { opacity: 0; transform: scale(0.94); }
	to { opacity: 1; transform: scale(1); }
}

.fpl-card--changed { animation: fpl-card-pulse 0.7s ease; }
@keyframes fpl-card-pulse {
	0% { border-color: var(--blue); }
	100% { border-color: var(--line); }
}

@media (prefers-reduced-motion: reduce) {
	.fpl-card { transition: none; }
	.fpl-run, .fpl-card--new, .fpl-card--changed { transition: none; animation: none; }
	.fpl-run--entering, .fpl-run--leaving { opacity: 1; position: static; }
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/stats-panel.css assets/panels/fpl.css
git commit -m "feat(fpl-status): add shared and panel CSS"
```

---

### Task 3: `charts/distribution.js` — whisker + top-15 chart

**Files:**
- Create: `assets/charts/distribution.js`

**Interfaces:**
- Consumes: global `uPlot` (Task 1), CSS classes from Task 2.
- Produces: `Distribution.renderWhisker(container: HTMLElement, dist: {p10, median, mean, p90} | null) -> void` — clears and (re)fills `container` with an inline SVG whisker, or leaves it empty if `dist` is null. `Distribution.renderTop15Chart(container: HTMLElement, players: Array<{web_name, xpts}>) -> void` — clears and mounts a uPlot range-bar chart into `container`.

- [ ] **Step 1: Set up the scratch verification fixture (one-time, reused by later tasks)**

```bash
mkdir -p /tmp/fpl-status-verify/assets/charts /tmp/fpl-status-verify/assets/panels /tmp/fpl-status-verify/data/simulations
cp /home/linus/Projects/linus-j.github.io/assets/style.css /tmp/fpl-status-verify/assets/style.css
cp /home/linus/Projects/linus-j.github.io/assets/charts/uplot.iife.min.js /tmp/fpl-status-verify/assets/charts/
cp /home/linus/Projects/linus-j.github.io/assets/charts/uplot.min.css /tmp/fpl-status-verify/assets/charts/
```

Create `/tmp/fpl-status-verify/data/simulations/gw3.json` (also used by Tasks 5–8 — 3 starters is enough to exercise the rendering paths without transcribing a full 15-player squad every time; Task 7's end-to-end check uses a full 15-player fixture instead):

```json
{
  "schema_version": 1,
  "gameweek": 3,
  "label": "GW3 — 3 Aug",
  "generated_at": "2026-08-03T06:05:00Z",
  "squad": [
    {"player_id": 13, "web_name": "Haaland", "position": "FWD", "team_short": "MCI", "now_cost": 15.1, "is_starting": true, "is_captain": true, "is_vice_captain": false, "bench_order": null, "xpts": {"p10": 3.1, "median": 7.9, "mean": 8.2, "p90": 13.4}},
    {"player_id": 8, "web_name": "Salah", "position": "MID", "team_short": "LIV", "now_cost": 13.2, "is_starting": true, "is_captain": false, "is_vice_captain": false, "bench_order": null, "xpts": {"p10": 2.0, "median": 5.9, "mean": 6.2, "p90": 12.5}},
    {"player_id": 2, "web_name": "Raya", "position": "GKP", "team_short": "ARS", "now_cost": 5.5, "is_starting": false, "is_captain": false, "is_vice_captain": false, "bench_order": 1, "xpts": {"p10": 1.5, "median": 3.0, "mean": 3.1, "p90": 4.9}}
  ],
  "top15": [
    {"player_id": 13, "web_name": "Haaland", "position": "FWD", "team_short": "MCI", "xpts": {"p10": 3.1, "median": 7.9, "mean": 8.2, "p90": 13.4}},
    {"player_id": 8, "web_name": "Salah", "position": "MID", "team_short": "LIV", "xpts": {"p10": 2.0, "median": 5.9, "mean": 6.2, "p90": 12.5}},
    {"player_id": 2, "web_name": "Raya", "position": "GKP", "team_short": "ARS", "xpts": {"p10": 1.5, "median": 3.0, "mean": 3.1, "p90": 4.9}}
  ],
  "history": [
    {"gameweek": 3, "type": "transfers", "transfers_in": ["Haaland"], "transfers_out": ["Wilson"], "hits_taken": 0, "net_xpts_gain": 1.4},
    {"gameweek": 2, "type": "chip", "chip": "wildcard", "reason": "squad overhaul after early injuries"}
  ]
}
```

- [ ] **Step 2: Write the failing check script**

Create `/tmp/fpl-status-verify/check_distribution.py`:

```python
from playwright.sync_api import sync_playwright
import pathlib

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    page.goto("http://localhost:8931/test-distribution.html")
    page.wait_for_timeout(300)

    whisker_svg = page.locator("#whisker-test svg").count()
    top15_canvas = page.locator("#top15-test canvas").count()
    # uPlot is canvas-based (confirms via `ctx.fillText`, not DOM/SVG <text>
    # nodes -- grep the vendored bundle for `createElementNS`/`fillText` to
    # see this yourself), so axis labels aren't queryable as DOM text. A
    # screenshot is the only way to confirm "Haaland" actually renders on
    # the chart, not just that a canvas exists.
    page.screenshot(path="/tmp/fpl-status-verify/screenshot-distribution.png")

    print("whisker_svg:", whisker_svg)
    print("top15_canvas:", top15_canvas)
    print("errors:", errors)

    browser.close()
```

Create `/tmp/fpl-status-verify/test-distribution.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/charts/uplot.min.css">
</head><body>
<div id="whisker-test" style="width:200px"></div>
<div id="top15-test" style="width:700px"></div>
<script src="assets/charts/uplot.iife.min.js"></script>
<script src="assets/charts/distribution.js"></script>
<script>
Distribution.renderWhisker(document.getElementById("whisker-test"), {p10: 3.1, median: 7.9, mean: 8.2, p90: 13.4});
fetch("data/simulations/gw3.json").then(r => r.json()).then(run => {
  Distribution.renderTop15Chart(document.getElementById("top15-test"), run.top15);
});
</script>
</body></html>
```

- [ ] **Step 3: Run the check to verify it fails**

Run:
```bash
cd /tmp/fpl-status-verify && (python3 -m http.server 8931 &>/tmp/http.log & echo $! > /tmp/http.pid) && sleep 1 && uvx --with playwright python3 check_distribution.py; kill $(cat /tmp/http.pid)
```
Expected: `whisker_svg: 0`, `top15_canvas: 0` (or a page error) — `assets/charts/distribution.js` doesn't exist yet, so `Distribution` is undefined.

- [ ] **Step 4: Implement**

Create `assets/charts/distribution.js` (in the real repo, `/home/linus/Projects/linus-j.github.io/assets/charts/distribution.js`):

```javascript
/* Generic xPts-uncertainty visuals: a compact inline SVG whisker for a
   single player card, and a uPlot range chart for comparing many
   players on a shared scale. */

var Distribution = (function () {
	function renderWhisker(container, dist) {
		container.innerHTML = "";
		if (!dist) return;

		var p10 = dist.p10, p90 = dist.p90, mean = dist.mean;
		var pad = (p90 - p10) * 0.15 || 1;
		var lo = p10 - pad;
		var hi = p90 + pad;
		var scale = function (v) {
			return (4 + ((v - lo) / (hi - lo)) * 52).toFixed(1);
		};

		var svgNs = "http://www.w3.org/2000/svg";
		var svg = document.createElementNS(svgNs, "svg");
		svg.setAttribute("viewBox", "0 0 60 10");
		svg.setAttribute("preserveAspectRatio", "none");
		svg.setAttribute("aria-hidden", "true");

		var xLo = scale(p10), xHi = scale(p90), xMean = scale(mean);

		var line = document.createElementNS(svgNs, "line");
		line.setAttribute("x1", xLo); line.setAttribute("y1", "5");
		line.setAttribute("x2", xHi); line.setAttribute("y2", "5");
		line.setAttribute("class", "whisker-line");

		var capLo = document.createElementNS(svgNs, "line");
		capLo.setAttribute("x1", xLo); capLo.setAttribute("y1", "2");
		capLo.setAttribute("x2", xLo); capLo.setAttribute("y2", "8");
		capLo.setAttribute("class", "whisker-cap");

		var capHi = document.createElementNS(svgNs, "line");
		capHi.setAttribute("x1", xHi); capHi.setAttribute("y1", "2");
		capHi.setAttribute("x2", xHi); capHi.setAttribute("y2", "8");
		capHi.setAttribute("class", "whisker-cap");

		var dot = document.createElementNS(svgNs, "circle");
		dot.setAttribute("cx", xMean); dot.setAttribute("cy", "5"); dot.setAttribute("r", "1.6");
		dot.setAttribute("class", "whisker-mean");

		svg.appendChild(line);
		svg.appendChild(capLo);
		svg.appendChild(capHi);
		svg.appendChild(dot);
		container.appendChild(svg);
	}

	function whiskerCanvasPlugin() {
		function draw(u) {
			var ctx = u.ctx;
			ctx.save();
			var capHalf = 5;
			for (var i = 0; i < u.data[0].length; i++) {
				var p10 = u.data[1][i];
				var p90 = u.data[2][i];
				var mean = u.data[3][i];
				if (p10 == null || p90 == null) continue;

				var x = u.valToPos(i, "x", true);
				var yLow = u.valToPos(p10, "y", true);
				var yHigh = u.valToPos(p90, "y", true);

				ctx.beginPath();
				ctx.strokeStyle = "#3ecdc2";
				ctx.lineWidth = 1.5;
				ctx.moveTo(x, yLow);
				ctx.lineTo(x, yHigh);
				ctx.moveTo(x - capHalf, yLow);
				ctx.lineTo(x + capHalf, yLow);
				ctx.moveTo(x - capHalf, yHigh);
				ctx.lineTo(x + capHalf, yHigh);
				ctx.stroke();

				if (mean != null) {
					var yMean = u.valToPos(mean, "y", true);
					ctx.beginPath();
					ctx.fillStyle = "#ff8952";
					ctx.arc(x, yMean, 3, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			ctx.restore();
		}
		return { hooks: { drawClear: [draw] } };
	}

	function renderTop15Chart(container, players) {
		container.innerHTML = "";
		if (!players.length) return;

		var idx = players.map(function (_, i) { return i; });
		var p10s = players.map(function (p) { return p.xpts ? p.xpts.p10 : null; });
		var p90s = players.map(function (p) { return p.xpts ? p.xpts.p90 : null; });
		var means = players.map(function (p) { return p.xpts ? p.xpts.mean : null; });

		var opts = {
			width: container.clientWidth || 700,
			height: 280,
			padding: [16, 20, 8, 8],
			cursor: { points: { show: false } },
			legend: { show: false },
			scales: {
				x: { time: false, distr: 2 },
				y: { range: function (u, min, max) { return uPlot.rangeNum(min, max, 0.15, true); } },
			},
			series: [
				{},
				{ scale: "y", paths: function () { return null; }, points: { show: false } },
				{ scale: "y", paths: function () { return null; }, points: { show: false } },
				{ scale: "y", paths: function () { return null; }, points: { show: false } },
			],
			axes: [
				{
					space: 42,
					font: "10px ui-monospace, monospace",
					values: function (u, splits) {
						return splits.map(function (i) { return players[i] ? players[i].web_name : ""; });
					},
					stroke: "#625d75",
					grid: { stroke: "#262233", width: 1 },
				},
				{
					stroke: "#625d75",
					grid: { stroke: "#262233", width: 1 },
				},
			],
			plugins: [whiskerCanvasPlugin()],
		};

		new uPlot(opts, [idx, p10s, p90s, means], container);
	}

	return { renderWhisker: renderWhisker, renderTop15Chart: renderTop15Chart };
})();
```

Then copy it into the scratch fixture too (only for this task's own verification — later tasks re-copy the latest version of every file they need):
```bash
cp /home/linus/Projects/linus-j.github.io/assets/charts/distribution.js /tmp/fpl-status-verify/assets/charts/distribution.js
```

- [ ] **Step 5: Run the check to verify it passes**

Run the same command as Step 3.
Expected: `whisker_svg: 1`, `top15_canvas: 1`, `errors: []`. Then look at `/tmp/fpl-status-verify/screenshot-distribution.png` — confirm the top-15 chart shows teal whisker lines with orange mean dots per player, and "Haaland" is legible as an x-axis label (uPlot draws axis text via canvas `fillText`, not DOM/SVG nodes, so this can only be confirmed visually, not queried).

Note on why this chart uses a real chart library (uPlot) for the top-15 comparison but plain inline SVG for each squad card's whisker: the top-15 view benefits from a single shared x-axis scale across 15 players (so relative magnitudes are directly comparable, with real interactive tooltips) — a genuine use for a charting library. Each squad card's whisker is self-scaled to just that one player's own range and doesn't need axes/legends/interactivity, so instantiating 15 separate canvas-based chart objects for the squad view would be wasteful; a tiny hand-drawn SVG is the right tool there instead.

- [ ] **Step 6: Commit**

```bash
git add assets/charts/distribution.js
git commit -m "feat(fpl-status): add whisker and top-15 chart components"
```

---

### Task 4: `charts/timeline.js` — event-log timeline

**Files:**
- Create: `assets/charts/timeline.js`

**Interfaces:**
- Produces: `Timeline.render(container: HTMLElement, history: Array<{gameweek, type, ...}>) -> void` — clears and fills `container` with a reverse-chronological event list, or an empty-state message if `history` is empty. Handles `type: "transfers"` (`transfers_in`, `transfers_out`, `hits_taken`, `net_xpts_gain`) and `type: "chip"` (`chip`, `reason`).

- [ ] **Step 1: Write the failing check script**

Create `/tmp/fpl-status-verify/test-timeline.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/style.css">
</head><body>
<div id="timeline-test" style="width:400px"></div>
<div id="timeline-empty-test" style="width:400px"></div>
<script src="assets/charts/timeline.js"></script>
<script>
fetch("data/simulations/gw3.json").then(r => r.json()).then(run => {
  Timeline.render(document.getElementById("timeline-test"), run.history);
  Timeline.render(document.getElementById("timeline-empty-test"), []);
});
</script>
</body></html>
```

Create `/tmp/fpl-status-verify/check_timeline.py`:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    page.goto("http://localhost:8931/test-timeline.html")
    page.wait_for_timeout(300)

    rows = page.locator("#timeline-test .timeline-row").count()
    text = page.locator("#timeline-test").inner_text()
    empty_text = page.locator("#timeline-empty-test .timeline-empty").inner_text()

    print("rows:", rows)
    print("contains_transfer_arrow:", "→" in text)
    print("contains_wilson:", "Wilson" in text)
    print("contains_wildcard:", "wildcard" in text)
    print("empty_text:", empty_text)
    print("errors:", errors)

    browser.close()
```

- [ ] **Step 2: Run the check to verify it fails**

Run:
```bash
cd /tmp/fpl-status-verify && (python3 -m http.server 8931 &>/tmp/http.log & echo $! > /tmp/http.pid) && sleep 1 && uvx --with playwright python3 check_timeline.py; kill $(cat /tmp/http.pid)
```
Expected: `errors` contains a `Timeline is not defined` page error (file doesn't exist yet).

- [ ] **Step 3: Implement**

Create `assets/charts/timeline.js`:

```javascript
/* Generic vertical event-log timeline: reverse-chronological entries with
   a connecting rail and a colored dot per event type. */

var Timeline = (function () {
	var EVENT_COLORS = { transfers: "var(--teal)", chip: "var(--orange)" };

	function describeEvent(event) {
		if (event.type === "transfers") {
			var inNames = event.transfers_in.length ? event.transfers_in.join(", ") : "—";
			var outNames = event.transfers_out.length ? event.transfers_out.join(", ") : "—";
			var hits = event.hits_taken
				? " (" + event.hits_taken + " hit" + (event.hits_taken > 1 ? "s" : "") + ")"
				: "";
			var gain = event.net_xpts_gain >= 0
				? "+" + event.net_xpts_gain.toFixed(1)
				: event.net_xpts_gain.toFixed(1);
			return outNames + " → " + inNames + hits + ", " + gain + " xPts";
		}
		if (event.type === "chip") {
			return event.reason ? event.chip + " played — " + event.reason : event.chip + " played";
		}
		return "";
	}

	function render(container, history) {
		container.innerHTML = "";
		if (!history.length) {
			var empty = document.createElement("p");
			empty.className = "timeline-empty";
			empty.textContent = "No transfer or chip history yet.";
			container.appendChild(empty);
			return;
		}

		var list = document.createElement("div");
		list.className = "timeline-list";

		history.forEach(function (event) {
			var row = document.createElement("div");
			row.className = "timeline-row";

			var rail = document.createElement("div");
			rail.className = "timeline-rail";
			var dot = document.createElement("span");
			dot.className = "timeline-dot";
			dot.style.background = EVENT_COLORS[event.type] || "var(--fg-faint)";
			rail.appendChild(dot);

			var text = document.createElement("div");
			text.className = "timeline-text";
			var gwSpan = document.createElement("span");
			gwSpan.className = "timeline-gw";
			gwSpan.textContent = "GW" + event.gameweek;
			text.appendChild(gwSpan);
			text.appendChild(document.createTextNode(" — " + describeEvent(event)));

			row.appendChild(rail);
			row.appendChild(text);
			list.appendChild(row);
		});

		container.appendChild(list);
	}

	return { render: render };
})();
```

```bash
cp /home/linus/Projects/linus-j.github.io/assets/charts/timeline.js /tmp/fpl-status-verify/assets/charts/timeline.js
```

- [ ] **Step 4: Run the check to verify it passes**

Run the same command as Step 2.
Expected: `rows: 2`, `contains_transfer_arrow: True`, `contains_wilson: True`, `contains_wildcard: True`, `empty_text: No transfer or chip history yet.`, `errors: []`.

- [ ] **Step 5: Commit**

```bash
git add assets/charts/timeline.js
git commit -m "feat(fpl-status): add timeline component"
```

---

### Task 5: `stats-panel.js` — generic engine

**Files:**
- Create: `assets/stats-panel.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the generic engine; it calls into a panel object it's given).
- Produces: `StatsPanel.mount(panel: {repo, path, fallbackUrl, renderRun}, root: HTMLElement) -> Promise<void>`. `root` must contain `.stats-panel-header` and `.stats-panel-body` children. Sets `root.dataset.state` to `"loading" | "ready" | "error" | "empty"` as it progresses. Fetches `https://cdn.jsdelivr.net/gh/{panel.repo}@main/{panel.path}/index.json`, populates a `<select class="stats-panel-select">` inside the header from `index.runs`, and on load/change fetches `{run.id}.json` and calls `panel.renderRun(body, run, prevRun)`. Both the index and every run fetch are checked against a `SUPPORTED_SCHEMA_VERSION` constant (currently `1`) — a mismatch is treated the same as a fetch failure (error state, fallback link), so a future breaking schema change on the bot-repo side degrades gracefully instead of rendering garbage.

- [ ] **Step 1: Write the failing check script**

Create `/tmp/fpl-status-verify/test-stats-panel.html` (uses a fake panel object pointed at the local fixture path instead of jsDelivr, via a `baseUrlOverride` the test wires in directly — the production code always uses the real jsDelivr URL; this override exists only in this throwaway test harness, not in the shipped file):

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/stats-panel.css">
</head><body>
<div class="stats-panel" id="test-panel">
	<div class="stats-panel-header"><h2>Test Panel</h2></div>
	<div class="stats-panel-body"></div>
</div>
<div class="stats-panel" id="error-panel">
	<div class="stats-panel-header"><h2>Error Panel</h2></div>
	<div class="stats-panel-body"></div>
</div>
<div class="stats-panel" id="badschema-panel">
	<div class="stats-panel-header"><h2>Bad Schema Panel</h2></div>
	<div class="stats-panel-body"></div>
</div>
<script src="assets/stats-panel.js"></script>
<script>
window.__mounted = false;
var realFetch = window.fetch;
window.fetch = function (url) {
	// redirect any jsDelivr URL to the local fixture path for this test only,
	// and simulate a real 404 for the deliberately-nonexistent repo
	if (url.indexOf("cdn.jsdelivr.net") !== -1) {
		if (url.indexOf("does-not-exist") !== -1) {
			return Promise.resolve(new Response("not found", { status: 404 }));
		}
		var marker = "@main/";
		var relPath = url.substring(url.indexOf(marker) + marker.length);
		return realFetch(relPath);
	}
	return realFetch(url);
};

var testPanel = {
	repo: "someone/some-repo", path: "data/simulations",
	fallbackUrl: "https://example.com/fallback",
	renderRun: function (body, run) {
		var p = document.createElement("p");
		p.className = "render-marker";
		p.textContent = "rendered " + run.gameweek;
		body.appendChild(p);
	},
};
var errorPanel = {
	repo: "someone/does-not-exist", path: "data/simulations",
	fallbackUrl: "https://example.com/fallback",
	renderRun: function () {},
};
var badSchemaPanel = {
	repo: "someone/bad-schema", path: "data/simulations-badschema",
	fallbackUrl: "https://example.com/fallback",
	renderRun: function () {},
};
Promise.all([
	StatsPanel.mount(testPanel, document.getElementById("test-panel")),
	StatsPanel.mount(errorPanel, document.getElementById("error-panel")),
	StatsPanel.mount(badSchemaPanel, document.getElementById("badschema-panel")),
]).then(function () { window.__mounted = true; });
</script>
</body></html>
```

Create `/tmp/fpl-status-verify/check_stats_panel.py`:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    page.goto("http://localhost:8931/test-stats-panel.html")
    page.wait_for_function("window.__mounted === true", timeout=10000)

    state = page.get_attribute("#test-panel", "data-state")
    marker = page.locator("#test-panel .render-marker").inner_text()
    select_options = page.locator("#test-panel .stats-panel-select option").count()

    error_state = page.get_attribute("#error-panel", "data-state")
    error_link_href = page.locator("#error-panel .stats-panel-message a").get_attribute("href")

    badschema_state = page.get_attribute("#badschema-panel", "data-state")
    badschema_message = page.locator("#badschema-panel .stats-panel-message").inner_text()

    print("state:", state)
    print("marker:", marker)
    print("select_options:", select_options)
    print("error_state:", error_state)
    print("error_link_href:", error_link_href)
    print("badschema_state:", badschema_state)
    print("badschema_message:", badschema_message)
    print("errors:", errors)

    browser.close()
```

`data/simulations/index.json` (for the fixture repo `"someone/some-repo"`; already created in Task 3's setup at `/tmp/fpl-status-verify/data/simulations/index.json` — if it doesn't exist yet, create it now):

```json
{"schema_version": 1, "runs": [{"id": "gw3", "gameweek": 3, "label": "GW3 — 3 Aug", "generated_at": "2026-08-03T06:05:00Z"}]}
```

`data/simulations-badschema/index.json` (for the fixture repo `"someone/bad-schema"` — a deliberately unsupported schema version, to exercise the guard):

```bash
mkdir -p /tmp/fpl-status-verify/data/simulations-badschema
echo '{"schema_version": 99, "runs": [{"id": "gw3", "gameweek": 3, "label": "GW3", "generated_at": "t"}]}' > /tmp/fpl-status-verify/data/simulations-badschema/index.json
```

- [ ] **Step 2: Run the check to verify it fails**

Run:
```bash
cd /tmp/fpl-status-verify && (python3 -m http.server 8931 &>/tmp/http.log & echo $! > /tmp/http.pid) && sleep 1 && uvx --with playwright python3 check_stats_panel.py; kill $(cat /tmp/http.pid)
```
Expected: a page error, `StatsPanel is not defined`.

- [ ] **Step 3: Implement**

Create `assets/stats-panel.js`:

```javascript
/* Generic stats-panel engine: fetch index -> populate <select> -> fetch
   run on change -> hand off to the panel's own renderRun. Knows nothing
   about any specific panel's data shape. */

var StatsPanel = (function () {
	var SUPPORTED_SCHEMA_VERSION = 1;

	function jsDelivrUrl(repo, path, file) {
		return "https://cdn.jsdelivr.net/gh/" + repo + "@main/" + path + "/" + file;
	}

	function fetchJson(url) {
		return fetch(url).then(function (res) {
			if (!res.ok) throw new Error("fetch failed: " + res.status + " " + url);
			return res.json();
		});
	}

	function fetchSupportedJson(url) {
		return fetchJson(url).then(function (data) {
			if (data.schema_version !== SUPPORTED_SCHEMA_VERSION) {
				throw new Error(
					"unsupported schema_version " + data.schema_version + " at " + url +
					" (expected " + SUPPORTED_SCHEMA_VERSION + ")"
				);
			}
			return data;
		});
	}

	function el(tag, className) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	}

	function renderMessage(body, text, linkUrl, linkText) {
		body.innerHTML = "";
		var p = el("p", "stats-panel-message");
		p.appendChild(document.createTextNode(text));
		if (linkUrl) {
			var link = document.createElement("a");
			link.href = linkUrl;
			link.textContent = linkText;
			p.appendChild(document.createTextNode(" "));
			p.appendChild(link);
		}
		body.appendChild(p);
	}

	function buildSelect(header, runs, onChange) {
		var existing = header.querySelector(".stats-panel-select");
		if (existing) existing.remove();
		var select = el("select", "stats-panel-select");
		runs.forEach(function (run) {
			var option = document.createElement("option");
			option.value = run.id;
			option.textContent = run.label;
			select.appendChild(option);
		});
		select.addEventListener("change", function () { onChange(select.value); });
		header.appendChild(select);
		return select;
	}

	function mount(panel, root) {
		var header = root.querySelector(".stats-panel-header");
		var body = root.querySelector(".stats-panel-body");
		root.setAttribute("data-state", "loading");
		renderMessage(body, "Loading…");

		return fetchSupportedJson(jsDelivrUrl(panel.repo, panel.path, "index.json"))
			.catch(function () {
				root.setAttribute("data-state", "error");
				renderMessage(body, "Couldn't load live data.", panel.fallbackUrl, "View the source repo instead →");
				return null;
			})
			.then(function (index) {
				if (!index) return;

				if (!index.runs || index.runs.length === 0) {
					root.setAttribute("data-state", "empty");
					renderMessage(body, "No runs published yet — check back later.");
					return;
				}

				var currentRun = null;

				function loadRun(runId) {
					root.setAttribute("data-state", "loading");
					renderMessage(body, "Loading…");
					return fetchSupportedJson(jsDelivrUrl(panel.repo, panel.path, runId + ".json"))
						.then(function (run) {
							root.setAttribute("data-state", "ready");
							panel.renderRun(body, run, currentRun);
							currentRun = run;
						})
						.catch(function () {
							root.setAttribute("data-state", "error");
							renderMessage(body, "Couldn't load that run.", panel.fallbackUrl, "View the source repo instead →");
						});
				}

				buildSelect(header, index.runs, loadRun);
				return loadRun(index.runs[0].id);
			});
	}

	return { mount: mount };
})();
```

```bash
cp /home/linus/Projects/linus-j.github.io/assets/stats-panel.js /tmp/fpl-status-verify/assets/stats-panel.js
```

- [ ] **Step 4: Run the check to verify it passes**

Run the same command as Step 2.
Expected: `state: ready`, `marker: rendered 3`, `select_options: 1`, `error_state: error`, `error_link_href: https://example.com/fallback`, `badschema_state: error`, `badschema_message: Couldn't load live data. View the source repo instead →`, `errors: []`.

- [ ] **Step 5: Commit**

```bash
git add assets/stats-panel.js
git commit -m "feat(fpl-status): add generic stats-panel engine"
```

---

### Task 6: `panels/fpl.js` — FPL panel (static render, no animation yet)

**Files:**
- Create: `assets/panels/fpl.js`

**Interfaces:**
- Consumes: `Distribution.renderWhisker`, `Distribution.renderTop15Chart` (Task 3), `Timeline.render` (Task 4).
- Produces: `FplPanel` object with `repo: "Linus-J/FPL-26-27-bot"`, `path: "data/simulations"`, `fallbackUrl`, and `renderRun(body, run, prevRun)` — the shape `StatsPanel.mount` (Task 5) expects. Renders three `<section>`s into `body`: `.fpl-squad` (grouped position rows + bench), `.fpl-top15`, `.fpl-history`. This task's version ignores `prevRun` (no animation yet — that's Task 8, layered on top once this static version is verified correct).

- [ ] **Step 1: Write the failing check script**

Create `/tmp/fpl-status-verify/test-fpl-panel.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/charts/uplot.min.css">
<link rel="stylesheet" href="assets/stats-panel.css">
<link rel="stylesheet" href="assets/panels/fpl.css">
</head><body>
<div class="stats-panel" id="fpl-panel">
	<div class="stats-panel-header"><h2>Current Squad</h2></div>
	<div class="stats-panel-body"></div>
</div>
<script src="assets/charts/uplot.iife.min.js"></script>
<script src="assets/charts/distribution.js"></script>
<script src="assets/charts/timeline.js"></script>
<script src="assets/panels/fpl.js"></script>
<script>
fetch("data/simulations/gw3.json").then(r => r.json()).then(run => {
	FplPanel.renderRun(document.getElementById("fpl-panel").querySelector(".stats-panel-body"), run, null);
	window.__rendered = true;
});
</script>
</body></html>
```

Create `/tmp/fpl-status-verify/check_fpl_panel.py`:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    page.goto("http://localhost:8931/test-fpl-panel.html")
    page.wait_for_function("window.__rendered === true", timeout=10000)
    page.wait_for_timeout(200)

    forward_cards = page.locator(".fpl-squad .fpl-card").count()
    captain_card = page.locator(".fpl-card--captain .fpl-card-name").inner_text()
    bench_label = page.locator(".fpl-position-label--bench").count()
    top15_canvas = page.locator(".fpl-top15-chart canvas").count()
    timeline_rows = page.locator(".fpl-history .timeline-row").count()

    print("forward_cards:", forward_cards)
    print("captain_card:", captain_card)
    print("bench_label:", bench_label)
    print("top15_canvas:", top15_canvas)
    print("timeline_rows:", timeline_rows)
    print("errors:", errors)

    browser.close()
```

- [ ] **Step 2: Run the check to verify it fails**

Run:
```bash
cd /tmp/fpl-status-verify && (python3 -m http.server 8931 &>/tmp/http.log & echo $! > /tmp/http.pid) && sleep 1 && uvx --with playwright python3 check_fpl_panel.py; kill $(cat /tmp/http.pid)
```
Expected: page error, `FplPanel is not defined`.

- [ ] **Step 3: Implement**

Create `assets/panels/fpl.js`:

```javascript
/* FPL-specific stats panel: config + squad/top15/history rendering.
   Everything generic (fetch, select, loading/error states, chart/timeline
   components) lives in stats-panel.js and assets/charts/. */

var FplPanel = (function () {
	var POSITION_ORDER = ["FWD", "MID", "DEF", "GKP"];
	var POSITION_LABELS = { FWD: "Forwards", MID: "Midfielders", DEF: "Defenders", GKP: "Goalkeeper" };

	function el(tag, className) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	}

	function buildPlayerCard(player) {
		var card = el("div", "fpl-card");
		card.dataset.playerId = player.player_id;
		if (player.is_captain) card.classList.add("fpl-card--captain");

		var top = el("div", "fpl-card-top");
		var name = el("span", "fpl-card-name");
		name.textContent = player.is_captain ? player.web_name + " (C)" : player.web_name;
		var meta = el("span", "fpl-card-meta");
		meta.textContent = player.position + " · £" + player.now_cost.toFixed(1);
		top.appendChild(name);
		top.appendChild(meta);

		var whisker = el("div", "fpl-card-whisker");
		Distribution.renderWhisker(whisker, player.xpts);

		var value = el("span", "fpl-card-value");
		value.textContent = player.xpts ? player.xpts.mean.toFixed(1) : "—";

		card.appendChild(top);
		card.appendChild(whisker);
		card.appendChild(value);
		return card;
	}

	function buildSquadSection(squad) {
		var section = el("section", "fpl-squad");
		var starters = squad.filter(function (p) { return p.is_starting; });
		var bench = squad
			.filter(function (p) { return !p.is_starting; })
			.sort(function (a, b) { return (a.bench_order || 0) - (b.bench_order || 0); });

		POSITION_ORDER.forEach(function (pos) {
			var players = starters.filter(function (p) { return p.position === pos; });
			if (!players.length) return;
			var label = el("h3", "fpl-position-label");
			label.textContent = POSITION_LABELS[pos];
			var list = el("div", "fpl-position-list");
			players.forEach(function (p) { list.appendChild(buildPlayerCard(p)); });
			section.appendChild(label);
			section.appendChild(list);
		});

		if (bench.length) {
			var benchLabel = el("h3", "fpl-position-label fpl-position-label--bench");
			benchLabel.textContent = "Bench";
			var benchList = el("div", "fpl-position-list");
			bench.forEach(function (p) { benchList.appendChild(buildPlayerCard(p)); });
			section.appendChild(benchLabel);
			section.appendChild(benchList);
		}

		return section;
	}

	function buildTop15Section(top15) {
		var section = el("section", "fpl-top15");
		var heading = el("h3", "fpl-section-heading");
		heading.textContent = "Top 15 by xPts";
		var chart = el("div", "fpl-top15-chart");
		section.appendChild(heading);
		section.appendChild(chart);
		Distribution.renderTop15Chart(chart, top15);
		return section;
	}

	function buildHistorySection(history) {
		var section = el("section", "fpl-history");
		var heading = el("h3", "fpl-section-heading");
		heading.textContent = "History";
		var timeline = el("div", "fpl-timeline");
		section.appendChild(heading);
		section.appendChild(timeline);
		Timeline.render(timeline, history);
		return section;
	}

	function renderRun(body, run) {
		body.innerHTML = "";
		body.appendChild(buildSquadSection(run.squad));
		body.appendChild(buildTop15Section(run.top15));
		body.appendChild(buildHistorySection(run.history));
	}

	return {
		repo: "Linus-J/FPL-26-27-bot",
		path: "data/simulations",
		fallbackUrl: "https://github.com/Linus-J/FPL-26-27-bot/tree/main/data/simulations",
		renderRun: renderRun,
	};
})();
```

```bash
cp /home/linus/Projects/linus-j.github.io/assets/panels/fpl.js /tmp/fpl-status-verify/assets/panels/fpl.js
```

- [ ] **Step 4: Run the check to verify it passes**

Run the same command as Step 2.
Expected: `forward_cards: 2` (Haaland + Salah are the only starters in the 3-player Task 3 fixture — Salah is MID not FWD, so this counts all `.fpl-card` under `.fpl-squad`, both sections), `captain_card: Haaland (C)`, `bench_label: 1`, `top15_canvas: 1`, `timeline_rows: 2`, `errors: []`.

- [ ] **Step 5: Commit**

```bash
git add assets/panels/fpl.js
git commit -m "feat(fpl-status): add FPL panel squad/top15/history rendering"
```

---

### Task 7: `fpl-status.html` page + nav crumbs

**Files:**
- Create: `fpl-status.html`
- Modify: `index.html`
- Modify: `system.html`
- Modify: `contact.html`

**Interfaces:**
- Consumes: `assets/style.css`, `assets/charts/uplot.min.css`, `assets/stats-panel.css`, `assets/panels/fpl.css`, `assets/charts/uplot.iife.min.js`, `assets/charts/distribution.js`, `assets/charts/timeline.js`, `assets/stats-panel.js`, `assets/panels/fpl.js`, `StatsPanel.mount`, `FplPanel` (all prior tasks).
- Produces: the live page at `fpl-status.html`, and a `~/fpl-status` crumb added to every page's `nav.crumbs`.

- [ ] **Step 1: Create `fpl-status.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="content-type" content="text/html; charset=UTF-8">
<title>FPL Status — Linus Jeary</title>
<meta name="description" content="Live status of Linus Jeary's Fantasy Premier League manager bot: current squad, top xPts projections, and transfer/chip history.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index, follow">
<meta name="color-scheme" content="dark">
<link rel="stylesheet" type="text/css" href="assets/style.css">
<link rel="stylesheet" type="text/css" href="assets/charts/uplot.min.css">
<link rel="stylesheet" type="text/css" href="assets/stats-panel.css">
<link rel="stylesheet" type="text/css" href="assets/panels/fpl.css">
<link rel="icon" href="favicon.png">
</head>
<body>
<main>

<header class="site-header">
	<h1>FPL Status</h1>
	<p class="tagline"><span class="prompt">$</span> fpl status<br>Live squad, xPts projections, and decision history from the FPL bot<span class="cursor"></span></p>
	<nav class="crumbs">
		<a href="index.html">~/home</a><span class="sep">/</span><a href="system.html">~/system</a><span class="sep">/</span><a href="fpl-status.html" class="current">~/fpl-status</a><span class="sep">/</span><a href="contact.html">~/contact</a>
	</nav>
</header>

<article>

<p>A live view of the <a href="https://github.com/Linus-J/FPL-26-27-bot">FPL 26/27 Manager Bot</a>'s current squad, Monte Carlo xPts projections, and transfer/chip history — sourced directly from the bot's own data exports, updated after each gameweek's decision.</p>

<div class="stats-panel" id="fpl-panel">
	<div class="stats-panel-header">
		<h2>Current Squad</h2>
	</div>
	<div class="stats-panel-body"></div>
</div>

<noscript>
	<p>This page needs JavaScript to show live data. You can view the raw exported data directly on
	<a href="https://github.com/Linus-J/FPL-26-27-bot/tree/main/data/simulations">GitHub</a> instead.</p>
</noscript>

</article>
</main>

<footer>
	<a href="https://linus-j.github.io/">linus-j.github.io</a> &middot; 2026
</footer>

<script src="assets/charts/uplot.iife.min.js"></script>
<script src="assets/charts/distribution.js"></script>
<script src="assets/charts/timeline.js"></script>
<script src="assets/stats-panel.js"></script>
<script src="assets/panels/fpl.js"></script>
<script>
	StatsPanel.mount(FplPanel, document.getElementById("fpl-panel"));
</script>
</body>
</html>
```

- [ ] **Step 2: Add the nav crumb to `index.html`**

In `index.html`, find:
```html
		<a href="index.html" class="current">~/home</a><span class="sep">/</span><a href="system.html">~/system</a><span class="sep">/</span><a href="contact.html">~/contact</a>
```
Replace with:
```html
		<a href="index.html" class="current">~/home</a><span class="sep">/</span><a href="system.html">~/system</a><span class="sep">/</span><a href="fpl-status.html">~/fpl-status</a><span class="sep">/</span><a href="contact.html">~/contact</a>
```

- [ ] **Step 3: Add the nav crumb to `system.html`**

In `system.html`, find:
```html
		<a href="index.html">~/home</a><span class="sep">/</span><a href="system.html" class="current">~/system</a><span class="sep">/</span><a href="contact.html">~/contact</a>
```
Replace with:
```html
		<a href="index.html">~/home</a><span class="sep">/</span><a href="system.html" class="current">~/system</a><span class="sep">/</span><a href="fpl-status.html">~/fpl-status</a><span class="sep">/</span><a href="contact.html">~/contact</a>
```

- [ ] **Step 4: Add the nav crumb to `contact.html`**

In `contact.html`, find:
```html
		<a href="index.html">~/home</a><span class="sep">/</span><a href="system.html">~/system</a><span class="sep">/</span><a href="contact.html" class="current">~/contact</a>
```
Replace with:
```html
		<a href="index.html">~/home</a><span class="sep">/</span><a href="system.html">~/system</a><span class="sep">/</span><a href="fpl-status.html">~/fpl-status</a><span class="sep">/</span><a href="contact.html" class="current">~/contact</a>
```

- [ ] **Step 5: Write the end-to-end check script (full 15-player fixture)**

Create `/tmp/fpl-status-verify/data/simulations/gw3-full.json` — reuse the complete 15-player fixture built and already verified during this plan's own verification pass (2 GKP, 5 DEF, 5 MID, 3 FWD, 11 starters, 4 bench, 15 top15 entries, 3 history events — the same shape as Task 3's 3-player fixture, just complete). Since this is long, generate it once and keep it in the scratch dir; re-use the fixture from Task 3's `gw3.json` for the other checks but use this fuller one specifically to confirm section grouping across all four positions plus bench in one page.

Create `/tmp/fpl-status-verify/check_full_page.py`:

```python
from playwright.sync_api import sync_playwright
import pathlib

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 900, "height": 1400})
    console_errors = []
    page.on("pageerror", lambda exc: console_errors.append(str(exc)))

    page.goto("http://localhost:8931/fpl-status.html")
    page.wait_for_selector(".fpl-squad", timeout=10000)
    page.wait_for_timeout(300)

    crumbs = page.locator("nav.crumbs a").all_inner_texts()
    position_labels = page.locator(".fpl-position-label").all_inner_texts()
    squad_cards = page.locator(".fpl-squad .fpl-card").count()
    top15_canvas = page.locator(".fpl-top15-chart canvas").count()

    print("crumbs:", crumbs)
    print("position_labels:", position_labels)
    print("squad_cards:", squad_cards)
    print("top15_canvas:", top15_canvas)
    print("console_errors:", console_errors)

    page.screenshot(path=str(pathlib.Path("/tmp/fpl-status-verify/screenshot-full-page.png")), full_page=True)
    browser.close()
```

This serves the *real repo directory* (not the `/tmp/fpl-status-verify` scratch copy) so it needs `data/simulations/gw3.json` and `index.json` to exist relative to the repo root for local testing — copy the scratch fixtures in temporarily, run the check, then remove them (they must never be committed):

```bash
cp -r /tmp/fpl-status-verify/data /home/linus/Projects/linus-j.github.io/data
cd /home/linus/Projects/linus-j.github.io
sed -i 's#https://cdn.jsdelivr.net/gh/" + repo + "@main/" + path + "/" + file;#"data/simulations/" + file;#' assets/stats-panel.js  # TEMPORARY local-test override, revert in Step 7
(python3 -m http.server 8932 &>/tmp/http2.log & echo $! > /tmp/http2.pid) && sleep 1
cp /tmp/fpl-status-verify/check_full_page.py /tmp/fpl-status-verify/check_full_page_8932.py
sed -i 's/8931/8932/' /tmp/fpl-status-verify/check_full_page_8932.py
uvx --with playwright python3 /tmp/fpl-status-verify/check_full_page_8932.py
kill $(cat /tmp/http2.pid)
```

- [ ] **Step 6: Run and verify**

Expected: `crumbs` includes `~/home`, `~/system`, `~/fpl-status`, `~/contact`; `position_labels` is `['Forwards', 'Midfielders', 'Defenders', 'Goalkeeper', 'Bench']`; `squad_cards: 15`; `top15_canvas: 1`; `console_errors: []`. Visually inspect `/tmp/fpl-status-verify/screenshot-full-page.png` — squad grouped by position with captain's card orange-bordered, whisker mini-charts in every card, top-15 error-bar chart with legible axis labels, timeline below.

- [ ] **Step 7: Revert the temporary local-test override and remove the copied fixture data**

```bash
cd /home/linus/Projects/linus-j.github.io
git checkout -- assets/stats-panel.js
rm -rf data
git status --short   # confirm clean — no data/ directory, no stats-panel.js diff
```

- [ ] **Step 8: Commit**

```bash
git add fpl-status.html index.html system.html contact.html
git commit -m "feat(fpl-status): add the \$ fpl status page and nav crumbs"
```

---

### Task 8: Switch-run transition animation

**Files:**
- Modify: `assets/panels/fpl.js`
- Modify: `assets/panels/fpl.css`

**Interfaces:**
- Modifies: `FplPanel.renderRun(body, run, prevRun)` to use `prevRun` (previously ignored in Task 6). Players present in `run.squad` but absent from `prevRun.squad` get `.fpl-card--new` (fade+scale-in). Players whose `xpts.mean` changed between runs get `.fpl-card--changed` (border pulse). The whole section cross-fades: new content fades in while old content fades out and is removed from the DOM once its transition ends — confirmed via DOM inspection (not just visually) that the old content is actually removed, not just hidden.

This is a deliberate scoped-down version of "true FLIP" (which would also interpolate each continuing card's exact position/size across the reflow) — full FLIP requires capturing bounding-box geometry before the DOM mutates and is materially more complex to get right. This cross-fade + keyed new/changed marking was verified to give a genuinely legible "what changed" signal (confirmed against real fixture data: switching gameweeks correctly marked exactly the 2 players who left/joined the squad as new, and correctly pulsed every player whose projection changed) without the added risk. If true position-interpolating FLIP is wanted later, it can be layered on top of the same `prevIds`/`prevXpts` diffing this task establishes.

- [ ] **Step 1: Write the failing check script**

Create `/tmp/fpl-status-verify/data/simulations/gw2.json` (a second run, sharing 1 of the 3 Task-3-fixture players so the diff is exercisable):

```json
{
  "schema_version": 1,
  "gameweek": 2,
  "label": "GW2 — 27 Jul",
  "generated_at": "2026-07-27T06:05:00Z",
  "squad": [
    {"player_id": 13, "web_name": "Haaland", "position": "FWD", "team_short": "MCI", "now_cost": 15.0, "is_starting": true, "is_captain": true, "is_vice_captain": false, "bench_order": null, "xpts": {"p10": 2.9, "median": 7.6, "mean": 7.9, "p90": 13.0}},
    {"player_id": 16, "web_name": "Foden", "position": "MID", "team_short": "MCI", "now_cost": 8.9, "is_starting": true, "is_captain": false, "is_vice_captain": false, "bench_order": null, "xpts": {"p10": 1.1, "median": 3.9, "mean": 4.1, "p90": 8.5}},
    {"player_id": 2, "web_name": "Raya", "position": "GKP", "team_short": "ARS", "now_cost": 5.5, "is_starting": false, "is_captain": false, "is_vice_captain": false, "bench_order": 1, "xpts": {"p10": 1.4, "median": 2.9, "mean": 3.0, "p90": 4.7}}
  ],
  "top15": [
    {"player_id": 13, "web_name": "Haaland", "position": "FWD", "team_short": "MCI", "xpts": {"p10": 2.9, "median": 7.6, "mean": 7.9, "p90": 13.0}},
    {"player_id": 16, "web_name": "Foden", "position": "MID", "team_short": "MCI", "xpts": {"p10": 1.1, "median": 3.9, "mean": 4.1, "p90": 8.5}},
    {"player_id": 2, "web_name": "Raya", "position": "GKP", "team_short": "ARS", "xpts": {"p10": 1.4, "median": 2.9, "mean": 3.0, "p90": 4.7}}
  ],
  "history": [
    {"gameweek": 2, "type": "chip", "chip": "wildcard", "reason": "squad overhaul after early injuries"}
  ]
}
```

Note: `player_id: 13` (Haaland) appears in both fixtures with a *different* `xpts.mean` (8.2 in gw3, 7.9 in gw2) — this is what exercises `.fpl-card--changed`. `player_id: 8` (Salah, in gw3) is absent from gw2's squad, and `player_id: 16` (Foden, in gw2) is absent from gw3's squad — this is what exercises `.fpl-card--new` when switching gw2 → gw3.

Update `/tmp/fpl-status-verify/test-fpl-panel.html`'s script block to render gw3 first, then gw2 (as if `prevRun`), matching what the real page does on a dropdown switch:

```html
<script>
Promise.all([
	fetch("data/simulations/gw3.json").then(r => r.json()),
	fetch("data/simulations/gw2.json").then(r => r.json()),
]).then(function (runs) {
	var body = document.getElementById("fpl-panel").querySelector(".stats-panel-body");
	FplPanel.renderRun(body, runs[0], null);
	window.__firstRendered = true;
	setTimeout(function () {
		FplPanel.renderRun(body, runs[1], runs[0]);
		window.__secondRendered = true;
	}, 100);
});
</script>
```

Create `/tmp/fpl-status-verify/check_transition.py`:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    page.goto("http://localhost:8931/test-fpl-panel.html")
    page.wait_for_function("window.__secondRendered === true", timeout=10000)
    page.wait_for_timeout(500)  # let the 0.25s/0.4s/0.7s CSS transitions settle

    run_count = page.locator(".stats-panel-body > .fpl-run").count()
    new_cards = page.locator(".fpl-card--new .fpl-card-name").all_inner_texts()
    changed_cards = page.locator(".fpl-card--changed").count()

    print("run_count_after_switch:", run_count)
    print("new_cards:", new_cards)
    print("changed_cards:", changed_cards)
    print("errors:", errors)

    browser.close()
```

- [ ] **Step 2: Run the check to verify it fails**

Run:
```bash
cd /tmp/fpl-status-verify && (python3 -m http.server 8931 &>/tmp/http.log & echo $! > /tmp/http.pid) && sleep 1 && uvx --with playwright python3 check_transition.py; kill $(cat /tmp/http.pid)
```
Expected: `run_count_after_switch: 0` (Task 6's `renderRun` uses `body.innerHTML = ""` unconditionally and never wraps output in a `.fpl-run` element), `new_cards: []`, `changed_cards: 0`.

- [ ] **Step 3: Implement**

In `assets/panels/fpl.js`, modify `buildPlayerCard` to accept and apply diff info:

```javascript
	function buildPlayerCard(player, prevIds, prevXpts) {
		var card = el("div", "fpl-card");
		card.dataset.playerId = player.player_id;
		if (player.is_captain) card.classList.add("fpl-card--captain");
		if (prevIds && !prevIds.has(player.player_id)) card.classList.add("fpl-card--new");
		if (prevXpts && player.player_id in prevXpts) {
			var prevMean = prevXpts[player.player_id];
			var newMean = player.xpts ? player.xpts.mean : null;
			if (prevMean !== newMean) card.classList.add("fpl-card--changed");
		}

		var top = el("div", "fpl-card-top");
```
(the rest of `buildPlayerCard` is unchanged from Task 6).

Modify `buildSquadSection` to accept and thread through `prevIds`/`prevXpts`:

```javascript
	function buildSquadSection(squad, prevIds, prevXpts) {
		var section = el("section", "fpl-squad");
		var starters = squad.filter(function (p) { return p.is_starting; });
		var bench = squad
			.filter(function (p) { return !p.is_starting; })
			.sort(function (a, b) { return (a.bench_order || 0) - (b.bench_order || 0); });

		POSITION_ORDER.forEach(function (pos) {
			var players = starters.filter(function (p) { return p.position === pos; });
			if (!players.length) return;
			var label = el("h3", "fpl-position-label");
			label.textContent = POSITION_LABELS[pos];
			var list = el("div", "fpl-position-list");
			players.forEach(function (p) { list.appendChild(buildPlayerCard(p, prevIds, prevXpts)); });
			section.appendChild(label);
			section.appendChild(list);
		});

		if (bench.length) {
			var benchLabel = el("h3", "fpl-position-label fpl-position-label--bench");
			benchLabel.textContent = "Bench";
			var benchList = el("div", "fpl-position-list");
			bench.forEach(function (p) { benchList.appendChild(buildPlayerCard(p, prevIds, prevXpts)); });
			section.appendChild(benchLabel);
			section.appendChild(benchList);
		}

		return section;
	}
```

Replace `renderRun` entirely:

```javascript
	function renderRun(body, run, prevRun) {
		var prevIds = null;
		var prevXpts = null;
		if (prevRun) {
			prevIds = new Set(prevRun.squad.map(function (p) { return p.player_id; }));
			prevXpts = {};
			prevRun.squad.forEach(function (p) {
				prevXpts[p.player_id] = p.xpts ? p.xpts.mean : null;
			});
		}

		var newRun = el("div", "fpl-run");
		newRun.appendChild(buildSquadSection(run.squad, prevIds, prevXpts));
		newRun.appendChild(buildTop15Section(run.top15));
		newRun.appendChild(buildHistorySection(run.history));

		if (!prevRun) {
			body.innerHTML = "";
			body.appendChild(newRun);
			return;
		}

		newRun.classList.add("fpl-run--entering");
		body.appendChild(newRun);
		void newRun.offsetWidth; // force reflow so the transition actually plays
		newRun.classList.remove("fpl-run--entering");

		Array.prototype.slice.call(body.children)
			.filter(function (node) { return node !== newRun; })
			.forEach(function (oldRun) {
				oldRun.classList.add("fpl-run--leaving");
				oldRun.addEventListener("transitionend", function () { oldRun.remove(); }, { once: true });
			});
	}
```

In `assets/stats-panel.css`, change `.stats-panel-body { padding: 1.1rem 1.1rem 1.4rem; }` to add `position: relative;` (needed for `.fpl-run--leaving`'s `position: absolute` cross-fade to overlay correctly instead of stacking):

```css
.stats-panel-body { padding: 1.1rem 1.1rem 1.4rem; position: relative; }
```

Append to `assets/panels/fpl.css`:

```css
/* ---------------- Switch-run transition ---------------- */

.fpl-run {
	transition: opacity 0.25s ease;
	opacity: 1;
}
.fpl-run--entering { opacity: 0; }
.fpl-run--leaving {
	opacity: 0;
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.fpl-card--new { animation: fpl-card-enter 0.4s ease; }
@keyframes fpl-card-enter {
	from { opacity: 0; transform: scale(0.94); }
	to { opacity: 1; transform: scale(1); }
}

.fpl-card--changed { animation: fpl-card-pulse 0.7s ease; }
@keyframes fpl-card-pulse {
	0% { border-color: var(--blue); }
	100% { border-color: var(--line); }
}

@media (prefers-reduced-motion: reduce) {
	.fpl-run, .fpl-card--new, .fpl-card--changed { transition: none; animation: none; }
	.fpl-run--entering, .fpl-run--leaving { opacity: 1; position: static; }
}
```

(Both CSS blocks above were already included in Task 2's initial files if this plan is executed in order without deviation — if so, this step is a no-op confirmation rather than a new edit; check `git diff` before assuming changes are needed.)

Copy the updated files into the scratch fixture:
```bash
cp /home/linus/Projects/linus-j.github.io/assets/panels/fpl.js /tmp/fpl-status-verify/assets/panels/fpl.js
cp /home/linus/Projects/linus-j.github.io/assets/panels/fpl.css /tmp/fpl-status-verify/assets/panels/fpl.css
cp /home/linus/Projects/linus-j.github.io/assets/stats-panel.css /tmp/fpl-status-verify/assets/stats-panel.css
```

- [ ] **Step 4: Run the check to verify it passes**

Run the same command as Step 2.
Expected: `run_count_after_switch: 1` (the old `.fpl-run` was removed after its transition finished), `new_cards: ['Foden']` (Foden is in gw2 but wasn't in gw3, the "previous" run in this switch direction), `changed_cards: 1` (Haaland's mean changed from 8.2 to 7.9), `errors: []`.

- [ ] **Step 5: Commit**

```bash
git add assets/panels/fpl.js assets/panels/fpl.css assets/stats-panel.css
git commit -m "feat(fpl-status): animate squad transitions when switching runs"
```

---

### Task 9: `docs/stats-panel-schema.md`

**Files:**
- Create: `docs/stats-panel-schema.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write the schema doc**

Create `docs/stats-panel-schema.md`:

```markdown
# Stats panel JSON contract

This is the data contract any "stats panel" data source must produce to work with `assets/stats-panel.js`. The FPL bot (`FPL-26-27-bot`) is the first producer; future panels (Brighton, Knicks, England) should conform to the same shape.

## What's generic vs panel-specific

`stats-panel.js` itself only requires:

- An `index.json` at the configured `{repo}/{path}` with `schema_version` and a `runs` array of `{id, gameweek, label, generated_at}` (`gameweek` is treated as an opaque sortable/labelling field by the engine — it doesn't have to literally be an FPL gameweek for a future non-FPL panel, though `label` should describe whatever period it represents).
- A `{run.id}.json` per run with `schema_version` matching the index.
- A panel module (`FplPanel`, or a future `BrightonPanel` etc.) providing `repo`, `path`, `fallbackUrl`, and `renderRun(body, run, prevRun)`.

Everything *inside* a run file beyond `schema_version` is panel-specific — `squad`/`top15`/`history` are FPL's own field names, not part of the generic contract. A different panel is free to use different top-level keys, as long as its own `renderRun` knows how to read them.

The two reusable visual components do have their own small contracts, usable by any panel:

- `Distribution.renderWhisker(container, dist)` expects `dist` to be `null` or `{p10, median, mean, p90}` (all numbers).
- `Distribution.renderTop15Chart(container, players)` expects `players` to be an array of `{web_name, xpts}` where `xpts` is `null` or `{p10, median, mean, p90}` — the `top15` name is FPL-specific, but the shape reused by this component (any array of `{web_name, xpts}`) is what a future panel would need to reuse the same chart for its own "top N" view.
- `Timeline.render(container, history)` expects an array of `{gameweek, type, ...type-specific fields}`, where `type` is `"transfers"` (`transfers_in: string[]`, `transfers_out: string[]`, `hits_taken: number`, `net_xpts_gain: number`) or `"chip"` (`chip: string`, `reason: string`). A future panel wanting the same timeline component for a different kind of event would need its own `type` handling added to `describeEvent` in `assets/charts/timeline.js` — that function isn't sport-agnostic yet, unlike the rest of `timeline.js`.

## FPL run file shape (schema_version 1)

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

`position` is one of `"GKP" | "DEF" | "MID" | "FWD"` (matches `assets/panels/fpl.js`'s `POSITION_ORDER`/`POSITION_LABELS`). `bench_order` is `null` for starters, `1` for the bench goalkeeper, `2`/`3`/`4` for outfield bench players ordered by `xpts.mean` descending. `xpts` is `null` when no projection exists for a player yet (true cold-start case) rather than a misleading zero.

Produced by `FPL-26-27-bot`'s `scripts/export_site_data.py` — see that repo's `docs/superpowers/plans/2026-08-09-site-export.md` for the exact generation logic.
```

- [ ] **Step 2: Commit**

```bash
git add docs/stats-panel-schema.md
git commit -m "docs: document the stats-panel JSON contract"
```

---

### Task 10: Manual end-to-end verification against real data

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Wait for the bot repo to have pushed at least one real run**

This requires the bot repo's `scripts/export_site_data.py` (its own separate plan) to have been run at least once for real, without `--no-push`.

- [ ] **Step 2: Check the real jsDelivr URLs resolve**

Run:
```bash
curl -sI https://cdn.jsdelivr.net/gh/Linus-J/FPL-26-27-bot@main/data/simulations/index.json
```
Expected: `HTTP/2 200`, `content-type: application/json` (or similar), `access-control-allow-origin: *`.

- [ ] **Step 3: Serve the real site and load the real page**

```bash
cd /home/linus/Projects/linus-j.github.io && python3 -m http.server 8000
```
Open `http://localhost:8000/fpl-status.html` in a real browser (or repeat the Playwright screenshot pattern from Task 7, pointed at `localhost:8000` with no local-fixture override this time — the real `stats-panel.js` already points at the real jsDelivr URL). Confirm: squad renders with real player names, top-15 chart renders, history shows real transfers/chips, dropdown lists real past runs, switching runs animates and updates correctly.

- [ ] **Step 4: Verify graceful degradation**

Temporarily rename `assets/stats-panel.js` (e.g. `mv assets/stats-panel.js assets/stats-panel.js.bak`) and reload the page — confirm it fails to a broken-but-safe state gracefully is *not* what should happen; instead confirm the `<noscript>` block's content is what a no-JS user would see (view page source / disable JS in browser devtools rather than actually breaking the file) and that a genuine fetch failure (e.g. temporarily point `FplPanel.repo` at a nonexistent repo) shows the "Couldn't load live data" message with a working fallback link, not a blank or broken panel. Restore `assets/stats-panel.js` afterward: `mv assets/stats-panel.js.bak assets/stats-panel.js` (or `git checkout -- assets/stats-panel.js` / revert the temporary `FplPanel.repo` edit) and confirm `git status --short` is clean before moving on.

- [ ] **Step 5: Mobile viewport check**

Using browser devtools' responsive mode (or Playwright with a narrow viewport, e.g. `page.set_viewport_size({"width": 375, "height": 800})`), confirm squad cards wrap to ~45% width per the `@media (max-width: 560px)` rule in `fpl.css`, and the page has no horizontal scroll.

- [ ] **Step 6: Clean up scratch verification files**

```bash
rm -rf /tmp/fpl-status-verify
```
