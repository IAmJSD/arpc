import type { Enum, Object, Method } from "../BuildData";
import { getReturnType } from "./returnTypes";

// Builds the methods that are exposed by the API.
export function buildApiMethod(
	enums: Enum[], objects: Object[], structName: string, key: string,
	namespace: string, method: Method, isClient: boolean,
) {
	// TODO
}
