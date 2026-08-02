/* Minimal click-to-zoom lightbox. Fixed to the viewport (not the
   trigger element), so it always fits on screen regardless of scroll
   position or window size — unlike the old hover-span popup hack. */
(function () {
	"use strict";

	var overlay = document.createElement("div");
	overlay.className = "lightbox-overlay";
	overlay.setAttribute("aria-hidden", "true");

	var img = document.createElement("img");
	overlay.appendChild(img);

	var closeBtn = document.createElement("button");
	closeBtn.className = "lightbox-close";
	closeBtn.type = "button";
	closeBtn.textContent = "close ✕";
	overlay.appendChild(closeBtn);

	document.addEventListener("DOMContentLoaded", function () {
		document.body.appendChild(overlay);
	});

	function open(src, alt) {
		img.src = src;
		img.alt = alt || "";
		overlay.classList.add("active");
		overlay.setAttribute("aria-hidden", "false");
	}

	function close() {
		overlay.classList.remove("active");
		overlay.setAttribute("aria-hidden", "true");
		img.src = "";
	}

	document.addEventListener("click", function (e) {
		var trigger = e.target.closest && e.target.closest("[data-lightbox]");
		if (trigger) {
			e.preventDefault();
			open(trigger.getAttribute("data-lightbox"), trigger.getAttribute("alt") || trigger.getAttribute("data-alt"));
			return;
		}
		if (e.target === overlay || e.target === closeBtn) close();
	});

	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") close();
	});
})();
