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

	function sectionHeading(text) {
		var heading = el("h3", "fpl-section-heading");
		heading.textContent = text;
		return heading;
	}

	/* One line of plain English under a heading, so no graphic on the page
	   has to be guessed at. */
	function key(text) {
		var node = el("p", "fpl-key");
		node.textContent = text;
		return node;
	}

	function armband(player) {
		if (player.is_captain) return { suffix: " (C)", cls: "fpl-card--captain", label: "captain" };
		if (player.is_vice_captain) return { suffix: " (V)", cls: "fpl-card--vice", label: "vice-captain" };
		return null;
	}

	function buildPlayerCard(player, prevIds, prevXpts) {
		var card = el("div", "fpl-card");
		card.dataset.playerId = player.player_id;
		var role = armband(player);
		if (role) card.classList.add(role.cls);
		if (prevIds && !prevIds.has(player.player_id)) card.classList.add("fpl-card--new");
		if (prevXpts && player.player_id in prevXpts) {
			var prevMean = prevXpts[player.player_id];
			var newMean = player.xpts ? player.xpts.mean : null;
			if (prevMean !== newMean) card.classList.add("fpl-card--changed");
		}

		var name = el("div", "fpl-card-name");
		name.textContent = role ? player.web_name + role.suffix : player.web_name;
		var meta = el("div", "fpl-card-meta");
		meta.textContent = player.position + " \u00b7 \u00a3" + player.now_cost.toFixed(1);

		// The projection reads as plain labelled numbers: the mean, then the
		// interval it falls in. The key above the squad says what both are.
		var figure = el("div", "fpl-card-figure");
		var mean = el("span", "fpl-card-mean");
		mean.textContent = player.xpts ? player.xpts.mean.toFixed(1) : "\u2014";
		var unit = el("span", "fpl-card-unit");
		unit.textContent = "xPts";
		figure.appendChild(mean);
		figure.appendChild(unit);

		var range = Distribution.formatRange(player.xpts);
		if (range != null) {
			var rangeEl = el("span", "fpl-card-range");
			rangeEl.textContent = range;
			figure.appendChild(rangeEl);
		}

		// The card's own title carries the full name, so a name clipped by
		// the ellipsis is still readable on hover.
		card.title = Distribution.describe(player) + (role ? " \u00b7 " + role.label : "");

		card.appendChild(name);
		card.appendChild(meta);
		card.appendChild(figure);
		return card;
	}

	function buildSquadSection(squad, prevIds, prevXpts) {
		var section = el("section", "fpl-squad");
		section.appendChild(key("xPts = mean projected points \u00b7 range = " + Distribution.describeBasis(Distribution.basisOf(squad))));
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

	function buildTop15Section(top15) {
		var section = el("section", "fpl-top15");
		var chart = el("div", "fpl-top15-chart");
		var hasSpread = Distribution.renderRanked(chart, top15);
		section.appendChild(sectionHeading("Top 15 by xPts"));
		section.appendChild(key(hasSpread
			? "bar = mean xPts \u00b7 strip = " + Distribution.describeBasis(Distribution.basisOf(top15))
			: "bar = mean xPts"));
		section.appendChild(chart);
		return section;
	}

	function buildHistorySection(history) {
		var section = el("section", "fpl-history");
		section.appendChild(sectionHeading("History"));
		var timeline = el("div", "fpl-timeline");
		section.appendChild(timeline);
		Timeline.render(timeline, history);
		return section;
	}

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

		var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		newRun.classList.add("fpl-run--entering");
		body.appendChild(newRun);
		void newRun.offsetWidth; // force reflow so the transition actually plays
		newRun.classList.remove("fpl-run--entering");

		Array.prototype.slice.call(body.children)
			.filter(function (node) { return node !== newRun; })
			.forEach(function (oldRun) {
				oldRun.classList.add("fpl-run--leaving");
				// Under reduced motion, fpl-run--leaving changes no animatable
				// property (see fpl.css), so transitionend never fires — remove
				// immediately instead of waiting for an event that won't come.
				if (reducedMotion) {
					oldRun.remove();
				} else {
					oldRun.addEventListener("transitionend", function () { oldRun.remove(); }, { once: true });
				}
			});
	}

	return {
		repo: "Linus-J/FPL-decision-engine",
		// jsDelivr's GitHub proxy treats a bare "v2" as a semver-style tag
		// lookup (matches its vN tag convention), which 404s since v2 is a
		// branch, not a tag. The fully-qualified ref bypasses that.
		ref: "refs/heads/v2",
		path: "data/simulations",
		fallbackUrl: "https://github.com/Linus-J/FPL-decision-engine/tree/v2/data/simulations",
		renderRun: renderRun,
	};
})();
