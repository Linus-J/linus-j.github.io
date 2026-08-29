/* xPts-uncertainty presentation, drawn as text.

   The projections carry a distribution (p10 / mean / p90), but a bare
   error bar doesn't say what it's measuring. So uncertainty is shown two
   ways instead, both explicitly labelled where they appear:
     - as the literal 10th-90th percentile interval printed next to the
       mean in the squad table;
     - as a ranked ASCII bar chart for the top-15 comparison, where a run
       of '#' is the mean and a bracketed strip on the line beneath spans
       the percentile range.

   These distributions are right-skewed and floored at zero — a player who
   doesn't play scores 0, so p10 is 0.0 for most of a squad while p90 runs
   to double the mean. Any symmetric "mean +/- x" summary of that is wrong:
   it puts the lower bound below zero, which no player can score. Hence the
   explicit interval rather than a single spread figure.

   Everything below emits characters, not elements: the chart is one text
   node inside a <pre>. That means it has no styling to get out of sync
   with the rest of the page, it copies and pastes as the thing you see,
   and it prints. The cost is that column widths have to be computed in
   JS against the real glyph advance — see drawRanked. */

var Distribution = (function () {
	/* Every string here lands in a monospace <pre> set in a subsetted
	   JetBrains Mono (see style.css), so the drawing alphabet is kept to
	   plain ASCII — an en dash or a block-drawing character would risk a
	   tofu box or, worse, a fallback glyph of a different advance width
	   that silently breaks the column alignment. */
	var BAR = "#";
	var FILL = ".";
	var MIN_BAR_COLS = 12;
	var FALLBACK_COLS = 62;
	var NAME_COLS_MAX = 14;
	var VALUE_COLS = 4;

	/* Charts re-draw on resize and once webfonts land, so each live <pre>
	   keeps the data it was drawn from. Entries whose node has left the
	   document are dropped on the next pass rather than tracked. */
	var charts = [];

	/* The 10th-90th percentile interval, printed as-is. */
	function formatRange(dist) {
		if (!dist || dist.p10 == null || dist.p90 == null) return null;
		if (dist.p90 - dist.p10 < 0.05) return null;
		return dist.p10.toFixed(1) + "-" + dist.p90.toFixed(1);
	}

	function hasRange(dist) {
		return formatRange(dist) !== null;
	}

	/* Whether a set of entries carries any real spread to draw. The engine's
	   top-15 export currently writes the mean into all four percentile
	   fields; drawing a range strip against that would assert precision the
	   data doesn't have. Pure, so a caller can write the chart's key before
	   the chart itself exists. */
	function anySpread(entries) {
		return entries.some(function (e) { return hasRange(e.xpts); });
	}

	/* How a distribution's quantiles were derived. The engine marks entries
	   with approx:true when they come from a normal approximation rather
	   than real Monte Carlo draws — worth saying out loud, because under a
	   normal the median equals the mean by construction, so their agreement
	   is a property of the method and not evidence about the distribution.
	   Exports predating that key report "unknown", and we stay vague rather
	   than claim simulated outcomes we can't vouch for. */
	function basisOf(entries) {
		var seen = {};
		entries.forEach(function (e) {
			var d = e.xpts;
			if (!d || !hasRange(d)) return;
			seen[d.approx === true ? "approx" : d.approx === false ? "mc" : "unknown"] = true;
		});
		var kinds = Object.keys(seen);
		if (kinds.length === 0) return "none";
		if (kinds.length > 1) return "mixed";
		return kinds[0];
	}

	/* The phrase describing what the interval is, given that basis. */
	function describeBasis(basis) {
		if (basis === "mc") return "10th-90th percentile of simulated outcomes";
		if (basis === "approx") return "10th-90th percentile, normal approximation";
		if (basis === "mixed") return "10th-90th percentile (some entries use a normal approximation)";
		return "10th-90th percentile";
	}

	function describe(player) {
		var d = player.xpts;
		if (!d) return player.web_name + " - no projection";
		var parts = [player.web_name + " - mean " + d.mean.toFixed(1) + " xPts"];
		var range = formatRange(d);
		if (range) {
			var note = d.approx === true ? " (normal approximation)"
				: d.approx === false ? " (simulated outcomes)" : "";
			parts.push("10th-90th percentile " + range + note);
		}
		return parts.join(", ");
	}

	// ---------------- text helpers ----------------

	function repeat(ch, n) {
		return n > 0 ? new Array(n + 1).join(ch) : "";
	}

	function padEnd(s, n) { return s + repeat(" ", n - s.length); }
	function padStart(s, n) { return repeat(" ", n - s.length) + s; }

	function clip(s, n) {
		return s.length <= n ? s : s.slice(0, n - 1) + ".";
	}

	/* Column count for a <pre>, from its real width divided by the real
	   advance width of its current font. Measuring beats assuming: the
	   webfont may not have loaded yet, and the fallback stack's metrics
	   differ enough to overflow the container by several characters. */
	function columnsIn(pre) {
		var probe = document.createElement("span");
		probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;";
		probe.textContent = repeat("0", 100);
		pre.appendChild(probe);
		var charWidth = probe.getBoundingClientRect().width / 100;
		pre.removeChild(probe);

		// A detached or display:none node measures 0 wide. Nothing sensible
		// can be computed from that, so fall back and let the caller's
		// follow-up redraw fix it once the node is in the document.
		var available = pre.clientWidth;
		if (!charWidth || !available) return FALLBACK_COLS;
		return Math.max(MIN_BAR_COLS + NAME_COLS_MAX + VALUE_COLS + 4, Math.floor(available / charWidth));
	}

	function scaleOf(players) {
		var max = 0;
		players.forEach(function (p) {
			if (!p.xpts) return;
			max = Math.max(max, p.xpts.p90 != null ? p.xpts.p90 : p.xpts.mean);
		});
		return max;
	}

	function col(value, max, barCols) {
		if (!max) return 0;
		return Math.max(0, Math.min(barCols, Math.round((value / max) * barCols)));
	}

	/* One player = a bar line, plus a strip line when the interval is wide
	   enough to draw. The strip is bracketed rather than shaded so its two
	   ends are unambiguous at a single character's resolution. */
	function drawRanked(pre, players) {
		var ranked = players.slice().sort(function (a, b) {
			return (b.xpts ? b.xpts.mean : -Infinity) - (a.xpts ? a.xpts.mean : -Infinity);
		});

		var max = scaleOf(ranked);
		var hasSpread = anySpread(ranked);

		var nameCols = 0;
		ranked.forEach(function (p) { nameCols = Math.max(nameCols, p.web_name.length); });
		nameCols = Math.min(nameCols, NAME_COLS_MAX);

		var barCols = columnsIn(pre) - nameCols - VALUE_COLS - 4;
		if (barCols < MIN_BAR_COLS) barCols = MIN_BAR_COLS;

		var lines = [];
		ranked.forEach(function (player, i) {
			var d = player.xpts;
			// A blank line between entries. Without it the strip of one
			// player sits as close to the bar of the next as to its own,
			// and the pairing has to be worked out rather than seen.
			if (i > 0) lines.push("");
			var mean = d ? d.mean : null;
			var value = mean == null ? "-" : mean.toFixed(1);

			lines.push(
				padEnd(clip(player.web_name, nameCols), nameCols) + " |" +
				padEnd(repeat(BAR, col(mean || 0, max, barCols)), barCols) + " " +
				padStart(value, VALUE_COLS)
			);

			if (!hasSpread || !hasRange(d)) return;
			var lo = col(d.p10, max, barCols);
			var hi = col(d.p90, max, barCols);
			// A one-column interval has no room for "[]" without implying a
			// wider range than the data shows, so it goes undrawn.
			if (hi - lo < 1) return;
			lines.push(
				repeat(" ", nameCols) + " |" +
				repeat(" ", lo) + "[" + repeat(FILL, hi - lo - 1) + "]"
			);
		});

		pre.textContent = lines.join("\n");

		/* The bars are decoration to a screen reader — the names and figures
		   they encode are what matter, so the <pre> announces itself as one
		   labelled image instead of reading out runs of hashes. */
		pre.setAttribute("role", "img");
		pre.setAttribute("aria-label", "Ranked by mean projected points: " + ranked.map(function (p) {
			return p.web_name + " " + (p.xpts ? p.xpts.mean.toFixed(1) : "no projection");
		}).join(", ") + ".");

		return hasSpread;
	}

	function redrawAll() {
		charts = charts.filter(function (chart) { return document.body.contains(chart.pre); });
		charts.forEach(function (chart) { drawRanked(chart.pre, chart.players); });
	}

	/* Draws the chart into `container`, which must already be in the
	   document — the column count comes from its measured width.

	   Returns whether the data carried any real spread, so the caller can
	   label the view accordingly. */
	function renderRanked(container, players) {
		container.innerHTML = "";
		if (!players || !players.length) return false;

		var pre = document.createElement("pre");
		pre.className = "ascii-plot";
		container.appendChild(pre);

		var hasSpread = drawRanked(pre, players);
		charts.push({ pre: pre, players: players });

		// One redraw on the next frame, unconditionally: it costs a single
		// pass over at most a couple of dozen rows, and it catches both a
		// container that wasn't laid out yet and the case where the webfont
		// finished loading before this chart existed — document.fonts.ready
		// resolves once, and a chart created after that never hears about it.
		requestAnimationFrame(redrawAll);
		return hasSpread;
	}

	var resizeTimer = null;
	window.addEventListener("resize", function () {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(redrawAll, 150);
	});

	// The first draw can land before JetBrains Mono has loaded, and the
	// fallback monospace has a different advance width — so measure again
	// once the real font is in.
	if (document.fonts && document.fonts.ready) {
		document.fonts.ready.then(redrawAll);
	}

	return {
		formatRange: formatRange,
		basisOf: basisOf,
		hasSpread: anySpread,
		describeBasis: describeBasis,
		describe: describe,
		renderRanked: renderRanked,
	};
})();
