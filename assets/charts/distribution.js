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
