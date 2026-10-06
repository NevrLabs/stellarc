import { Schema } from "effect";

/** `parseTicketKey` behavioral mirror — fork apps/api/src/identity/identity.ts.
 * Board keys: 1-20 chars, start with a letter, then alnum/dash, end alnum.
 * `A--1` fails because the middle can't end in a dash; `KEY-0` fails on number. */
export const normalizeBoardKey = (value: string): string => value.toUpperCase();

export const parseTicketKey = (
	value: string,
): { boardKey: string; number: number } | null => {
	const match = /^([A-Za-z](?:[A-Za-z0-9-]{0,18}[A-Za-z0-9])?)-(\d+)$/.exec(
		value,
	);
	if (!match) return null;
	const number = Number(match[2]);
	if (!Number.isSafeInteger(number) || number <= 0) return null;
	return { boardKey: normalizeBoardKey(match[1]), number };
};

/** Wire validation for a board key token (the part before `-<number>`). */
export const boardKeySchema = Schema.String.pipe(
	Schema.minLength(1),
	Schema.maxLength(20),
	Schema.pattern(/^[A-Za-z][A-Za-z0-9-]{0,19}$/),
);
export type BoardKey = Schema.Schema.Type<typeof boardKeySchema>;
