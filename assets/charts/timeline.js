/* Generic vertical event-log timeline: reverse-chronological entries with
   a connecting rail and a marker per event type. */

var Timeline = (function () {

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
			// Chips are the rare, deliberate events — hollow marker so they
			// read as different from routine transfers without a second hue.
			dot.className = event.type === "chip" ? "timeline-dot timeline-dot--chip" : "timeline-dot";
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
