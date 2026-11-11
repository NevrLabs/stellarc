const $ = (id) => document.getElementById(id);
let state;
function notice(text, error = false) {
	$("notice").textContent = text;
	$("notice").toggleAttribute("data-error", error);
}
async function api(path, data) {
	const response = await fetch(path, {
		method: data === undefined ? "GET" : "POST",
		credentials: "same-origin",
		headers: { "content-type": "application/json" },
		...(data === undefined ? {} : { body: JSON.stringify(data) }),
	});
	const value = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(value.error || "Request failed");
	return value;
}
function rows(id, values) {
	const parent = $(id);
	parent.replaceChildren();
	for (const fields of values) {
		const row = document.createElement("tr");
		for (const field of fields) {
			const cell = document.createElement("td");
			if (field instanceof Node) cell.append(field);
			else cell.textContent = String(field);
			row.append(cell);
		}
		parent.append(row);
	}
}
function revoke(id, delegation) {
	const button = document.createElement("button");
	button.textContent = "Revoke";
	button.onclick = () =>
		action(async () => {
			await api("/manage/revoke", { id, delegation });
			await refresh();
		});
	return button;
}
async function refresh() {
	$("secret-value").value = "";
	$("secret").hidden = true;
	try {
		state = await api("/manage/status");
		$("login").hidden = true;
		$("workspace").hidden = false;
		$("identity").textContent = state.principal.id;
		$("provider").textContent = state.provider;
		notice(`Signed in · ${state.principal.org}`);
		rows(
			"principal-rows",
			state.principals.map((p) => [
				p.id,
				p.kind,
				p.permissions.join(" · "),
				p.enabled ? "Active" : "Disabled",
			]),
		);
		rows(
			"credential-rows",
			state.credentials.map((c) => [
				c.id,
				c.principal,
				new Date(c.expires_at).toLocaleString(),
				c.revoked ? "Revoked" : "Issued",
				c.revoked ? "—" : revoke(c.id, false),
			]),
		);
		rows(
			"delegation-rows",
			state.delegations.map((d) => [
				d.id,
				`${d.actor} → ${d.subject}`,
				d.remaining,
				d.revoked ? "Revoked" : "Issued",
				d.revoked ? "—" : revoke(d.id, true),
			]),
		);
		$("audit").textContent = state.audit
			? `${state.audit.seq} durable events · receiver accepted through ${state.audit.delivered}${state.audit.gap ? " · ATTENTION: audit gap state" : ""}`
			: "No audit events yet";
		$("llm-url").textContent =
			`${state.origin}/orgs/${state.principal.org}/v1/chat/completions`;
		$("mcp-url").textContent = `${state.origin}/mcp`;
	} catch (error) {
		$("workspace").hidden = true;
		$("login").hidden = false;
		notice(
			error.message === "sign_in_required"
				? "Sign in to manage your gateway."
				: error.message,
			error.message !== "sign_in_required",
		);
	}
}
async function action(fn) {
	try {
		await fn();
	} catch (error) {
		notice(error.message, true);
	}
}
$("refresh").onclick = refresh;
$("login").onclick = () =>
	action(async () => {
		const result = await api("/auth/login", {});
		location.assign(result.url);
	});
$("logout").onclick = () =>
	action(async () => {
		await api("/api/auth/sign-out", {});
		await refresh();
	});
$("clear-secret").onclick = () => {
	$("secret-value").value = "";
	$("secret").hidden = true;
};
$("new-agent").onclick = () => $("agent-dialog").showModal();
$("agent-dialog").addEventListener("close", () => {
	if ($("agent-dialog").returnValue !== "create") return;
	action(async () => {
		const form = $("agent-dialog").querySelector("form");
		const actions = [];
		if (form.elements.llm.checked) actions.push("llm:stream");
		if (form.elements.mcp.checked) actions.push("mcp:status");
		await api("/manage/agents", { actions });
		await refresh();
	});
});
let selectionMode;
function select(mode) {
	const agents =
		state?.principals.filter((p) => p.kind === "agent" && p.enabled) || [];
	if (!agents.length) {
		notice("Create an agent first.");
		return;
	}
	selectionMode = mode;
	$("select-title").textContent =
		mode === "credential"
			? "Issue one-hour credential"
			: "Delegate 100 metadata calls";
	$("agent-select").replaceChildren(
		...agents.map((p) => {
			const option = document.createElement("option");
			option.value = p.id;
			option.textContent = p.id;
			return option;
		}),
	);
	$("select-dialog").showModal();
}
$("new-key").onclick = () => select("credential");
$("new-delegation").onclick = () => select("delegation");
$("select-dialog").addEventListener("close", () => {
	if ($("select-dialog").returnValue !== "confirm") return;
	action(async () => {
		const principal = $("agent-select").value;
		if (selectionMode === "credential") {
			const result = await api("/manage/credentials", { principal, ttl: 3600 });
			await refresh();
			$("secret-value").value = result.raw;
			$("secret").hidden = false;
		} else {
			await api("/manage/delegations", {
				actor: principal,
				actions: ["mcp:status"],
				resource: "gateway",
				ttl: 3600,
				calls: 100,
			});
			await refresh();
		}
	});
});
refresh();
