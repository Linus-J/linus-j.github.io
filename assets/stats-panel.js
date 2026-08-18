/* Generic stats-panel engine: fetch index -> populate <select> -> fetch
   run on change -> hand off to the panel's own renderRun. Knows nothing
   about any specific panel's data shape. */

var StatsPanel = (function () {
	var SUPPORTED_SCHEMA_VERSION = 1;

	function jsDelivrUrl(repo, ref, path, file) {
		return "https://cdn.jsdelivr.net/gh/" + repo + "@" + ref + "/" + path + "/" + file;
	}

	function fetchJson(url) {
		return fetch(url).then(function (res) {
			if (!res.ok) throw new Error("fetch failed: " + res.status + " " + url);
			return res.json();
		});
	}

	/* Exact equality is deliberate: schema_version is a major version, so a
	   change to it means fields this page already reads have changed meaning
	   and rendering them anyway would be worse than not rendering. Purely
	   additive keys must not bump it. The mismatch is tagged so the failure
	   reads as "the page is stale", not "the network is down" — otherwise a
	   future bump looks identical to an outage. */
	function fetchSupportedJson(url) {
		return fetchJson(url).then(function (data) {
			if (data.schema_version !== SUPPORTED_SCHEMA_VERSION) {
				var err = new Error(
					"unsupported schema_version " + data.schema_version + " at " + url +
					" (expected " + SUPPORTED_SCHEMA_VERSION + ")"
				);
				err.schemaMismatch = true;
				throw err;
			}
			return data;
		});
	}

	function failureText(err) {
		return err && err.schemaMismatch
			? "This page is out of date with the data it's reading."
			: "Couldn't load live data.";
	}

	function el(tag, className) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	}

	function renderMessage(body, text, linkUrl, linkText) {
		body.innerHTML = "";
		var p = el("p", "stats-panel-message");
		p.appendChild(document.createTextNode(text));
		if (linkUrl) {
			var link = document.createElement("a");
			link.href = linkUrl;
			link.textContent = linkText;
			p.appendChild(document.createTextNode(" "));
			p.appendChild(link);
		}
		body.appendChild(p);
	}

	function buildSelect(header, runs, onChange) {
		var existing = header.querySelector(".stats-panel-select");
		if (existing) existing.remove();
		var select = el("select", "stats-panel-select");
		runs.forEach(function (run) {
			var option = document.createElement("option");
			option.value = run.id;
			option.textContent = run.label;
			select.appendChild(option);
		});
		select.addEventListener("change", function () { onChange(select.value); });
		header.appendChild(select);
		return select;
	}

	function mount(panel, root) {
		var header = root.querySelector(".stats-panel-header");
		var body = root.querySelector(".stats-panel-body");
		root.setAttribute("data-state", "loading");
		renderMessage(body, "Loading…");

		var ref = panel.ref || "main";

		return fetchSupportedJson(jsDelivrUrl(panel.repo, ref, panel.path, "index.json"))
			.catch(function (err) {
				root.setAttribute("data-state", "error");
				renderMessage(body, failureText(err), panel.fallbackUrl, "View the source repo instead →");
				return null;
			})
			.then(function (index) {
				if (!index) return;

				if (!index.runs || index.runs.length === 0) {
					root.setAttribute("data-state", "empty");
					renderMessage(body, "No runs published yet — check back later.");
					return;
				}

				var currentRun = null;

				function loadRun(runId) {
					root.setAttribute("data-state", "loading");
					renderMessage(body, "Loading…");
					return fetchSupportedJson(jsDelivrUrl(panel.repo, ref, panel.path, runId + ".json"))
						.then(function (run) {
							root.setAttribute("data-state", "ready");
							panel.renderRun(body, run, currentRun);
							currentRun = run;
						})
						.catch(function (err) {
							root.setAttribute("data-state", "error");
							renderMessage(body, failureText(err), panel.fallbackUrl, "View the source repo instead →");
						});
				}

				buildSelect(header, index.runs, loadRun);
				return loadRun(index.runs[0].id);
			});
	}

	return { mount: mount };
})();
