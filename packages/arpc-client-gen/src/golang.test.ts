import { runTests } from "../testHelpers";
import { golang } from "./golang";

runTests(__filename, "", (d) => golang(d));
