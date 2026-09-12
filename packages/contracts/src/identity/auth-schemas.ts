import { Schema } from "effect";
import { Email, UserPublic } from "./http";

// Better Auth route shapes (Schemas only — Better Auth serves these at its own
// base path in T1; no Effect endpoint declarations, to avoid a duplicate path contract).

export const SignInEmailRequest = Schema.Struct({
	email: Email,
	password: Schema.String,
	rememberMe: Schema.optional(Schema.Boolean),
	// Same-origin URL; the same-origin check is applied at T1, not the shape.
	callbackURL: Schema.optional(Schema.String),
});
export type SignInEmailRequest = Schema.Schema.Type<typeof SignInEmailRequest>;

export const SignInEmailResponse = Schema.Struct({
	redirect: Schema.Boolean,
	token: Schema.String,
	url: Schema.optional(Schema.String),
	user: UserPublic,
});
export type SignInEmailResponse = Schema.Schema.Type<
	typeof SignInEmailResponse
>;

export const SessionInfo = Schema.Struct({
	id: Schema.String,
	userId: Schema.String,
	expiresAt: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	activeOrganizationId: Schema.NullOr(Schema.String),
});
export type SessionInfo = Schema.Schema.Type<typeof SessionInfo>;

export const GetSessionResponse = Schema.NullOr(
	Schema.Struct({ session: SessionInfo, user: UserPublic }),
);
export type GetSessionResponse = Schema.Schema.Type<typeof GetSessionResponse>;

export const SignOutRequest = Schema.Struct({});
export type SignOutRequest = Schema.Schema.Type<typeof SignOutRequest>;

export const SignOutResponse = Schema.Struct({ success: Schema.Literal(true) });
export type SignOutResponse = Schema.Schema.Type<typeof SignOutResponse>;
