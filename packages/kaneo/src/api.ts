import { HttpApi } from "effect/http-api";
import { BoardsGroup, ColumnsGroup, LabelsGroup } from "./groups";
import { Authentication } from "./kernel";

/** Every endpoint here is served natively; anything else under /api falls
 * through to the legacy tree. */
export class KaneoApi extends HttpApi.make("kaneo")
	.add(BoardsGroup)
	.add(ColumnsGroup)
	.add(LabelsGroup)
	.middleware(Authentication) {}
