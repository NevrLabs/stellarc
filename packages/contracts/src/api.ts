import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

export class FoundationApi extends HttpApi.make("foundation").add(
	HttpApiGroup.make("foundation")
		.add(
			HttpApiEndpoint.get("health", "/health", {
				success: Schema.Struct({ status: Schema.Literals(["ok"]) }),
			}),
		)
		.add(
			HttpApiEndpoint.get("shape", "/orgs/:org/v1/shape", {
				params: Schema.Struct({
					org: Schema.NonEmptyString.pipe(
						Schema.check(Schema.isMaxLength(128)),
					),
				}),
			}),
		),
) {}
