import assert from "node:assert/strict";
import { boundedSse } from "./bounded-sse";

let checks = 0;
for (const multiline of [false, true]) {
	for (const length of [65535, 65536, 65537, 70000]) {
		const prefix = multiline ? "data: x\ndata: " : "data: ";
		const event = `${prefix}${"x".repeat(length - prefix.length - 1)}\n\n`;
		for (const width of [event.length, 10000, 1]) {
			let dispatched = 0;
			const parser = boundedSse(
				() => {
					dispatched++;
				},
				() => {
					throw new Error("frame_limit");
				},
			);
			const feed = () => {
				for (let i = 0; i < event.length; i += width)
					parser.feed(event.slice(i, i + width));
			};
			if (length > 65536) {
				assert.throws(feed, /frame_limit/);
				assert.equal(dispatched, 0);
			} else {
				feed();
				assert.equal(dispatched, 1);
			}
			checks++;
		}
	}
}
for (const wire of [
	"data: " + "x".repeat(65537),
	": " + "x".repeat(65537),
	"event: " + "x".repeat(65537),
]) {
	for (const width of [wire.length, 1]) {
		const parser = boundedSse(
			() => {},
			() => {
				throw new Error("frame_limit");
			},
		);
		assert.throws(() => {
			for (let i = 0; i < wire.length; i += width)
				parser.feed(wire.slice(i, i + width));
		}, /frame_limit/);
		checks++;
	}
}
let events = 0;
const parser = boundedSse(
	() => {
		events++;
	},
	() => {
		throw new Error("frame_limit");
	},
);
const wire = "\uFEFFdata: ☃\r\n\r\ndata: ok\r\rdata: last\n\n";
for (const char of wire) parser.feed(char);
assert.equal(events, 3);
console.log(`PASS bounded-sse: ${++checks} exact-boundary/pending/CRLF checks`);
