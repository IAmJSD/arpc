import { runTests } from "../testHelpers";
import { php } from "./php";

runTests(__filename, "", (d) => php(d, { namespace: "Test" }));
