/* xPts-uncertainty presentation.

   The projections carry a distribution (p10 / mean / p90), but a bare
   error bar doesn't say what it's measuring. So uncertainty is shown two
   ways instead, both explicitly labelled where they appear:
     - as the literal 10th-90th percentile interval next to the mean on
       each squad card;
     - as a ranked bar list for the top-15 comparison, where the mean is
       the bar and the percentile range is a separate strip beneath it.
   Ranking horizontally also puts player names on their own row, so they
   can't collide the way rotated x-axis ticks did.

   These distributions are right-skewed and floored at zero — a player who
   doesn't play scores 0, so p10 is 0.0 for most of a squad while p90 runs
   to double the mean. Any symmetric "mean ± x" summary of that is wrong:
   it puts the lower bound below zero, which no player can score. Hence the
   explicit interval rather than a single spread figure. */

var Distribution = (function () {
	/* The 10th-90th percentile interval, printed as-is. */
	function formatRange(dist) {
		if (!dist || dist.p10 == null || dist.p90 == null) return null;
		if (dist.p90 - dist.p10 < 0.05) return null;
		return dist.p10.toFixed(1) + "\u2013" + dist.p90.toFixed(1);
	}

	function hasRange(dist) {
		return formatRange(dist) !== null;
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
		if (basis === "mc") return "10th\u201390th percentile of simulated outcomes";
		if (basis === "approx") return "10th\u201390th percentile, normal approximation";
		if (basis === "mixed") return "10th\u201390th percentile (some entries use a normal approximation)";
		return "10th\u201390th percentile";
	}

	function el(tag, className) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	}

	function pct(value, max) {
		if (!max) return 0;
		return Math.max(0, Math.min(100, (value / max) * 100));
	}

	function describe(player) {
		var d = player.xpts;
		if (!d) return player.web_name + " — no projection";
		var parts = [player.web_name + " — mean " + d.mean.toFixed(1) + " xPts"];
		var range = formatRange(d);
		if (range) {
			var note = d.approx === true ? " (normal approximation)"
				: d.approx === false ? " (simulated outcomes)" : "";
			parts.push("10th\u201390th percentile " + range + note);
		}
		return parts.join(", ");
	}

	/* Returns whether the data carried any real spread, so the caller can
	   label the view accordingly. The engine's top-15 export currently
	   writes the mean into all four percentile fields; drawing a range
	   strip against that would assert precision the data doesn't have. */
	function renderRanked(container, players) {
		container.innerHTML = "";
		if (!players || !players.length) return false;

		var ranked = players.slice().sort(function (a, b) {
			return (b.xpts ? b.xpts.mean : -Infinity) - (a.xpts ? a.xpts.mean : -Infinity);
		});

		// Scale to the widest p90 so the range strips stay inside the track.
		var max = 0;
		var hasSpread = false;
		ranked.forEach(function (p) {
			if (!p.xpts) return;
			max = Math.max(max, p.xpts.p90 != null ? p.xpts.p90 : p.xpts.mean);
			if (hasRange(p.xpts)) hasSpread = true;
		});

		var list = el("div", "xpts-list");

		ranked.forEach(function (player) {
			var row = el("div", "xpts-row");
			row.title = describe(player);

			var name = el("span", "xpts-name");
			name.textContent = player.web_name;

			var track = el("span", "xpts-track");
			if (player.xpts) {
				var bar = el("span", "xpts-bar");
				bar.style.width = pct(player.xpts.mean, max).toFixed(2) + "%";
				track.appendChild(bar);

				if (hasSpread && player.xpts.p10 != null && player.xpts.p90 != null) {
					var left = pct(player.xpts.p10, max);
					var range = el("span", "xpts-range");
					range.style.left = left.toFixed(2) + "%";
					range.style.width = Math.max(0, pct(player.xpts.p90, max) - left).toFixed(2) + "%";
					track.appendChild(range);
				}
			}

			var mean = el("span", "xpts-mean");
			mean.textContent = player.xpts ? player.xpts.mean.toFixed(1) : "—";

			row.appendChild(name);
			row.appendChild(track);
			row.appendChild(mean);
			list.appendChild(row);
		});

		container.appendChild(list);
		return hasSpread;
	}

	return {
		formatRange: formatRange,
		basisOf: basisOf,
		describeBasis: describeBasis,
		describe: describe,
		renderRanked: renderRanked,
	};
})();
