import { expect, test } from "vitest";
import { safeTxid } from "../../packages/domain/src/index";
import { UpcasterRegistry } from "../../packages/sync/src/upcasters";

test("T15 version chains validate identity, synthetic v0, and reject unknown schemas", () => {
	const registry = new UpcasterRegistry();
	const type = "foundation:probe-upserted";
	expect(registry.decode(type, 1, { id: "a", value: "v1" })).toEqual({
		id: "a",
		value: "v1",
	});
	expect(() => registry.decode(type, 0, { legacy: "a" })).toThrow(
		"Unsupported event schema",
	);
	registry.register(type, 0, (payload) => {
		if (
			typeof payload !== "object" ||
			payload === null ||
			!("legacy" in payload)
		)
			throw new Error("Invalid fixture");
		return { id: payload.legacy, value: "converted" };
	});
	expect(registry.decode(type, 0, { legacy: "a" })).toEqual({
		id: "a",
		value: "converted",
	});
	for (const version of [-1, 0.5, 2, Number.NaN])
		expect(() => registry.decode(type, version, {})).toThrow(
			"Unsupported event schema",
		);
	expect(() => registry.decode("unknown:type", 1, {})).toThrow(
		"Unsupported event schema",
	);
	expect(() => registry.decode(type, 1, { id: "", value: 42 })).toThrow(
		"Unsupported event schema",
	);
	expect(registry.decode("foundation:probe-deleted", 1, { id: "a" })).toEqual({
		id: "a",
	});
});

test("transaction IDs reject overflow rather than rounding", () => {
	expect(safeTxid("123")).toBe(123);
	expect(() => safeTxid("9007199254740992")).toThrow(
		"Unsupported transaction ID",
	);
	expect(() => safeTxid("0")).toThrow("Unsupported transaction ID");
});
