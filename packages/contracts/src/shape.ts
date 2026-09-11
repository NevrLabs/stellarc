import { Schema } from "effect";
export const ProbeRow = Schema.Struct({
	org: Schema.String,
	id: Schema.String,
	value: Schema.String,
	last_seq: Schema.String,
});
export type ProbeRow = typeof ProbeRow.Type;
export const electricSchema = {
	org: { type: "text", not_null: true, pk_index: 0 },
	id: { type: "text", not_null: true, pk_index: 1 },
	value: { type: "text", not_null: true },
	last_seq: { type: "int8", not_null: true },
};
export const key = (org: string, id: string) => JSON.stringify([org, id]);
