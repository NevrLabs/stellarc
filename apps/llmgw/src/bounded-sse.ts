import * as Sse from "effect/encoding/Sse";

// Bound the whole event's wire state, including fields/comments and pending lines.
// Effect's pending-only check misses complete events dispatched in the same feed.
export function boundedSse(
	onEvent: Parameters<typeof Sse.makeParser>[0],
	tooLarge: () => never,
) {
	let size = 0;
	let line = 0;
	let cr = false;
	let first = true;
	const parser = Sse.makeParser(
		(event) => {
			if (event._tag === "Event" && event.data.length + 1 > 65536) tooLarge();
			onEvent(event);
		},
		{ maxEventSize: 65536, dispatchEmptyNamedEvents: true },
	);
	return {
		feed(text: string) {
			for (const char of text) {
				if (first) {
					first = false;
					if (char === "\uFEFF") continue;
				}
				if (cr && char === "\n") {
					cr = false;
					continue;
				}
				cr = char === "\r";
				if (char === "\n" || cr) {
					if (line === 0) size = 0;
					else if (++size > 65536) tooLarge();
					line = 0;
				} else {
					// Count UTF-16 units, matching the installed parser's ceiling.
					line += char.length;
					size += char.length;
					if (size > 65536) tooLarge();
				}
			}
			if (parser.feed(text)) tooLarge();
		},
	};
}
