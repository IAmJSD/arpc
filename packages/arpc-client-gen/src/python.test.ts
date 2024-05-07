import { describe } from "@jest/globals";
import { runTests } from "../testHelpers";
import { pythonAsync, pythonSync } from "./python";

describe("python async", () => runTests(__filename, "_async", pythonAsync));
describe("python sync", () => runTests(__filename, "_sync", pythonSync));
