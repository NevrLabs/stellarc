import { Ico } from "@/components/ui/icon";
import { type RunReceiptRow, runReceipts } from "@/fixtures/runs";

/** Run detail (NEVR-624): the per-attempt context receipt surfaced on the
 * task/run view — what each attempt received, as metadata only (kind, name,
 * size, 12-char SHA-256 prefix, delivery, confidence). Identical hashes
 * across attempts = unchanged context; a diverging prefix is the debugging
 * signal. Data comes from run fixtures shaped 1:1 like the plane's read path
 * (getTask → receipts); NEVR-434 swaps the source, not this component. */
export function RunDetail({ item }: { item: string }) {
	const receipts = runReceipts[item] ?? [];
	const attempts = [...new Set(receipts.map((r) => r.attempt))].sort(
		(a, b) => a - b,
	);
	const seededBytes = receipts
		.filter((r) => r.confidence === "seeded")
		.reduce((sum, r) => sum + r.bytes, 0);
	const fmt = (n: number) =>
		n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;

	return (
		<main className="work">
			<div className="toolbar">
				<div className="crumbs">
					<span>Agents</span>
					<Ico n="chevron-right" sm />
					<b>{item}</b>
				</div>
				<span className="sp" />
			</div>
			<div className="vp">
				<div className="pad">
					<h1 className="pg">{item}</h1>
					<p className="sub">
						Context receipt — what each attempt received. Metadata only: sizes
						and SHA-256 prefixes, never content.
					</p>
					<div className="kv">
						<div>
							<small>Attempts</small>
							<b>{attempts.length || "—"}</b>
						</div>
						<div>
							<small>Context sources</small>
							<b>{receipts.length}</b>
						</div>
						<div>
							<small>Seeded</small>
							<b>{fmt(seededBytes)}</b>
						</div>
						<div>
							<small>Referenced</small>
							<b>
								{receipts.filter((r) => r.confidence === "referenced").length}
							</b>
						</div>
					</div>
					{attempts.length === 0 ? (
						<p className="sub">No receipt recorded for this run.</p>
					) : (
						attempts.map((attempt) => (
							<section key={attempt}>
								<h2 className="sec">
									Attempt {attempt}
									{receipts.some(
										(r) => r.attempt === attempt && r.kind === "resume-digest",
									)
										? " · resumed"
										: ""}
								</h2>
								<table className="t">
									<thead>
										<tr>
											<th scope="col">Kind</th>
											<th scope="col">Name</th>
											<th scope="col">Size</th>
											<th scope="col">SHA-256</th>
											<th scope="col">Delivery</th>
											<th scope="col">Confidence</th>
										</tr>
									</thead>
									<tbody>
										{receipts
											.filter((r) => r.attempt === attempt)
											.map((r: RunReceiptRow) => (
												<tr key={`${r.attempt}-${r.position}`}>
													<td>
														<span className="chip">{r.kind}</span>
													</td>
													<td>{r.name}</td>
													<td>{fmt(r.bytes)}</td>
													<td className="mono">{r.sha256}</td>
													<td>{r.delivery}</td>
													<td>{r.confidence}</td>
												</tr>
											))}
									</tbody>
								</table>
							</section>
						))
					)}
				</div>
			</div>
		</main>
	);
}
