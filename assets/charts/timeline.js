/* Generic event log: reverse-chronological entries as a plain dated list.
   The gameweek is the term and the event is its definition, so the markup
   is a <dl> and the two columns are alignment, not decoration — there is
   no rail, no marker and no rule between rows. */

var Timeline = (function () {

	// The engine logs chips by their internal id, not a display name.
	var CHIP_NAMES = {
		freehit: "Free Hit",
		wildcard: "Wildcard",
		"3xc": "Triple Captain",
		bboost: "Bench Boost"
	};

	function chipDisplayName(chip) {
		return CHIP_NAMES[chip] || chip;
	}

	// Every event in this log is read as a gain in xPts, so they all format
	// it the same way.
	function formatGain(xpts) {
		return (xpts >= 0 ? "+" : "") + xpts.toFixed(1) + " xPts";
	}

	function describeEvent(event) {
		if (event.type === "transfers") {
			var inNames = event.transfers_in.length ? event.transfers_in.join(", ") : "none";
			var outNames = event.transfers_out.length ? event.transfers_out.join(", ") : "none";
			var hits = event.hits_taken
				? " (" + event.hits_taken + " hit" + (event.hits_taken > 1 ? "s" : "") + ")"
				: "";
			return outNames + " → " + inNames + hits + ", " + formatGain(event.net_xpts_gain);
		}
		if (event.type === "chip") {
			// Chips are the rare, deliberate events; naming the chip first
			// is enough to set them apart from routine transfer rows. The
			// engine also logs a free-form `reason`, and rendering it put a
			// sentence — sometimes three dash-joined clauses — where every
			// other row of the column is a number. The gain is the one thing
			// the reason was there to say, and the data now publishes it.
			var name = chipDisplayName(event.chip) + " played";
			return typeof event.net_xpts_gain === "number"
				? name + ", " + formatGain(event.net_xpts_gain)
				: name;
		}
		// The opening gameweek has no transfers to describe — there is no
		// squad to transfer out of yet — so the engine publishes the draft
		// itself as the event. Without this the week rendered as a blank
		// definition under its own term, which reads as a bug rather than
		// as "nothing was traded here".
		if (event.type === "initial_squad") return "Initial squad selected";
		return "";
	}

	function render(container, history) {
		container.innerHTML = "";
		if (!history.length) {
			var empty = document.createElement("p");
			empty.className = "meta";
			empty.textContent = "No transfer or chip history yet.";
			container.appendChild(empty);
			return;
		}

		var list = document.createElement("dl");
		list.className = "log";

		history.forEach(function (event) {
			var term = document.createElement("dt");
			term.textContent = "GW" + event.gameweek;

			var detail = document.createElement("dd");
			detail.textContent = describeEvent(event);

			list.appendChild(term);
			list.appendChild(detail);
		});

		container.appendChild(list);
	}

	return { render: render };
})();
