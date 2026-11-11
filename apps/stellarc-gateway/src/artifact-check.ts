import assert from "node:assert/strict";

// Run after build: deployment must carry the exact console bytes with main.js.
assert.ok(await Bun.file(new URL("../dist/main.js", import.meta.url)).exists());
for (const name of ["console.html", "console.js", "console.css"]) {
	const source = await Bun.file(
		new URL(`./${name}`, import.meta.url),
	).arrayBuffer();
	const built = await Bun.file(
		new URL(`../dist/${name}`, import.meta.url),
	).arrayBuffer();
	assert.deepEqual(new Uint8Array(built), new Uint8Array(source), name);
}
console.log("PASS built-console-assets-byte-identical");
