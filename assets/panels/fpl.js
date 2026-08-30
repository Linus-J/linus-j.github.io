/* FPL-specific stats panel: config + squad/top15/history rendering.
   Everything generic (fetch, select, loading/error states, the ASCII
   chart and the event log) lives in stats-panel.js and assets/charts/.

   The squad is a table because it is a table: eleven rows of the same
   five fields. Cards made every row its own little frame and then had to
   re-align them by hand; a <table> aligns by construction, sorts the eye
   down a column, and prints. */

var FplPanel = (function () {
	var POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"];

	function el(tag, className) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	}

	function heading(text) {
		var node = el("h3");
		node.textContent = text;
		return node;
	}

	/* One line of plain English under a heading, so no figure on the page
	   has to be guessed at. */
	function key(text) {
		var node = el("p", "meta");
		node.textContent = text;
		return node;
	}

	function cell(row, text, className) {
		var td = el("td", className);
		td.textContent = text;
		row.appendChild(td);
		return td;
	}

	function armband(player) {
		if (player.is_captain) return " (C)";
		if (player.is_vice_captain) return " (V)";
		return "";
	}

	function headerRow(showMarks) {
		var tr = el("tr");
		var labels = ["Player", "Pos", "Cost (m)", "xPts", "10-90"];
		if (showMarks) {
			var mark = el("th", "col-mark");
			mark.setAttribute("scope", "col");
			// The column's meaning is spelled out in the key beneath the
			// table; a visible header for one character of gutter would
			// be wider than the column it labels.
			mark.appendChild(document.createTextNode(""));
			tr.appendChild(mark);
		}
		labels.forEach(function (label, i) {
			var th = el("th", i >= 2 ? "num" : null);
			th.setAttribute("scope", "col");
			th.textContent = label;
			tr.appendChild(th);
		});
		return tr;
	}

	function playerRow(player, showMarks) {
		var tr = el("tr");
		if (showMarks) {
			cell(tr, player.transferred_in ? "+" : "", "col-mark");
		}

		var name = cell(tr, player.web_name + armband(player));
		// The row title carries the full description, so a truncated name
		// or an unfamiliar percentile is still readable on hover.
		tr.title = Distribution.describe(player);
		if (player.is_captain || player.is_vice_captain) name.className = "is-armband";

		cell(tr, player.position);
		cell(tr, player.now_cost.toFixed(1), "num");
		cell(tr, player.xpts ? player.xpts.mean.toFixed(1) : "-", "num");
		cell(tr, Distribution.formatRange(player.xpts) || "-", "num");
		return tr;
	}

	function buildTable(players, showMarks) {
		var table = el("table", "data");
		var thead = el("thead");
		thead.appendChild(headerRow(showMarks));
		var tbody = el("tbody");
		players.forEach(function (p) { tbody.appendChild(playerRow(p, showMarks)); });
		table.appendChild(thead);
		table.appendChild(tbody);
		return table;
	}

	function byPositionThenXpts(a, b) {
		var order = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
		if (order !== 0) return order;
		return (b.xpts ? b.xpts.mean : -Infinity) - (a.xpts ? a.xpts.mean : -Infinity);
	}

	/* Who arrived this gameweek is published per player, straight from the
	   decision the bot acted on. It used to be inferred here by diffing the
	   squad against whichever gameweek the visitor last had open, which made
	   the mark depend on click order rather than on the data: the panel opens
	   on the newest gameweek, so selecting GW1 diffed GW1 against GW2 and put
	   a "+" on the two players GW2 had transferred OUT, on the one squad that
	   was drafted rather than transferred into (2026-08-30).

	   Runs published before the field existed simply carry no marks. */
	function buildSquadSection(squad) {
		var section = el("section");
		var showMarks = squad.some(function (p) { return p.transferred_in; });

		section.appendChild(key(
			"xPts = mean projected points · 10-90 = " +
			Distribution.describeBasis(Distribution.basisOf(squad)) +
			" · cost in millions · (C) captain, (V) vice-captain" +
			(showMarks ? " · + = transferred in this gameweek" : "")
		));

		var starters = squad.filter(function (p) { return p.is_starting; }).sort(byPositionThenXpts);
		var bench = squad
			.filter(function (p) { return !p.is_starting; })
			.sort(function (a, b) { return (a.bench_order || 0) - (b.bench_order || 0); });

		section.appendChild(heading("Starting XI"));
		section.appendChild(buildTable(starters, showMarks));

		if (bench.length) {
			section.appendChild(heading("Bench"));
			section.appendChild(buildTable(bench, showMarks));
		}
		return section;
	}

	/* Returns the section plus the still-empty node the plot goes into.
	   The plot sizes its columns to the measured width of that node, so it
	   can only be drawn once the section is in the document — hence the
	   split between building this and filling it in renderRun. */
	function buildTop15Section(top15) {
		var section = el("section");
		var chart = el("div");

		section.appendChild(heading("Top 15 by xPts"));
		section.appendChild(key(Distribution.hasSpread(top15)
			? "# = mean xPts · [....] = " + Distribution.describeBasis(Distribution.basisOf(top15))
			: "# = mean xPts"));
		section.appendChild(chart);
		return { section: section, chart: chart };
	}

	function buildHistorySection(history) {
		var section = el("section");
		section.appendChild(heading("History"));
		var log = el("div");
		section.appendChild(log);
		Timeline.render(log, history);
		return section;
	}

	function renderRun(body, run) {
		var top15 = buildTop15Section(run.top15);

		body.innerHTML = "";
		body.appendChild(buildSquadSection(run.squad));
		body.appendChild(top15.section);
		body.appendChild(buildHistorySection(run.history));

		// Only now is the chart's container in the document and measurable.
		Distribution.renderRanked(top15.chart, run.top15);
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
