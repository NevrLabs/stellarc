import { expect, test } from "vitest";
import { safeTxid } from "../../packages/domain/src/index";

test("transaction IDs reject overflow rather than rounding", () => {
	expect(safeTxid("123")).toBe(123);
	expect(() => safeTxid("9007199254740992")).toThrow(
		"Unsupported transaction ID",
	);
	expect(() => safeTxid("0")).toThrow("Unsupported transaction ID");
});
