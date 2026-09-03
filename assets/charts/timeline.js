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

	// The engine's `reason` for a Free Hit/Wildcard is built as
	// "beats no-chip by X xPts — <detail>", where <detail> itself starts by
	// restating the chip's own name ("free hit: ..." / "wildcard: ...") —
	// redundant once the event already leads with "<Chip> played". Splitting
	// on the first " — " and dropping that restatement turns what was three
	// dash-joined clauses piled onto one line into two short sentences.
	// Other chips' reasons (3xc, bboost) carry no " — " at all and pass
	// through unchanged.
	function cleanChipReason(reason) {
		var sep = reason.indexOf(" — ");
		if (sep === -1) return reason;
		var summary = reason.slice(0, sep);
		var detail = reason.slice(sep + 3).replace(/^[a-z][a-z ]*:\s*/i, "");
		if (!detail) return summary + ".";
		return summary + ". " + detail.charAt(0).toUpperCase() + detail.slice(1) + ".";
	}

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
			var name = chipDisplayName(event.chip);
			return event.reason ? name + " played — " + cleanChipReason(event.reason) : name + " played";
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
