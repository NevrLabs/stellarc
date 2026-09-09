import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

export const FoundationApi = HttpApi.make("foundation").add(
	HttpApiGroup.make("foundation")
		.add(
			HttpApiEndpoint.get("health", "/health").addSuccess(
				Schema.Struct({ status: Schema.Literal("ok") }),
			),
		)
		.add(
			HttpApiEndpoint.get("shape", "/orgs/:org/v1/shape").setPath(
				Schema.Struct({
					org: Schema.NonEmptyString.pipe(Schema.maxLength(128)),
				}),
			),
		),
);
