/* Generic event log: reverse-chronological entries as a plain dated list.
   The gameweek is the term and the event is its definition, so the markup
   is a <dl> and the two columns are alignment, not decoration — there is
   no rail, no marker and no rule between rows. */

var Timeline = (function () {

	function describeEvent(event) {
		if (event.type === "transfers") {
			var inNames = event.transfers_in.length ? event.transfers_in.join(", ") : "none";
			var outNames = event.transfers_out.length ? event.transfers_out.join(", ") : "none";
			var hits = event.hits_taken
				? " (" + event.hits_taken + " hit" + (event.hits_taken > 1 ? "s" : "") + ")"
				: "";
			var gain = event.net_xpts_gain >= 0
				? "+" + event.net_xpts_gain.toFixed(1)
				: event.net_xpts_gain.toFixed(1);
			return outNames + " → " + inNames + hits + ", " + gain + " xPts";
		}
		if (event.type === "chip") {
			// Chips are the rare, deliberate events; naming the chip first
			// is enough to set them apart from routine transfer rows.
			return event.reason ? event.chip + " played — " + event.reason : event.chip + " played";
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
