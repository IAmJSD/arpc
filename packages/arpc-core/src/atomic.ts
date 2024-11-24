import { findRoute } from "./requestUtils";
import type {
    AuthenticatedRequestHandler, HandlerMapping, UnauthenticatedRequestHandler,
} from "./schema";

/** Type alias for what the variable should be. String is a bit ambiguous. */
type Variable = string;

/** Type alias for what the route should be. String is a bit ambiguous. */
type Route = string;

/** Defines the argument as a constant. */
type ConstantArgument = any;

/** Defines a operation to get a item. You cannot use before definition. */
type AtomicGetOperation = [Variable];

/** Defines the tree of attributes to pluck. */
type PluckAttributeTree = string[];

type MathsBase = [
    // Use this and call the route
    Variable | [ConstantArgument],

    // If this
    Variable, ConstantArgument, ">" | ">=" | "=" | "!",
];

/** Defines a mathematical operation. */
type AtomicMathsOperation = MathsBase | [...MathsBase, PluckAttributeTree];

/**
 * Defines different types of atomic operations all joined This exclused set because
 * that is route-less.
 */
type AtomicNonSetOperation = AtomicGetOperation | AtomicMathsOperation;

/** Defines a variable assignment. */
export type Assignment = Variable | [Variable, PluckAttributeTree];

/** Defines an atomic set operation. */
type AtomicSetOperation = [Variable, ConstantArgument];

/** Defines an item in a atomic request. */
export type AtomicItem =
    [Route, ConstantArgument] | // "call route with constant"
    [Route, ConstantArgument, Assignment] | // "call route with constant then assign"
    [AtomicNonSetOperation, Route] | // "call route with variable"
    [AtomicNonSetOperation, Route, Assignment] | // "call route with variable and then assign"
    [AtomicSetOperation]; // "only set the variable and return that"

/** Defines the error when there is a validation error. Note this does NOT extend Error. */
export type AtomicValidationError = {
    success: false;
    code: string;
    message: string;
};

/** Defines the success when there is a validation success. */
export type AtomicValidationSuccess<Handler> = {
    success: true;
    items: AtomicItem[];
    handlers: Map<Route, Handler>;
};

const invalidVar = (variable: string) => ({
    success: false,
    code: "INVALID_VARIABLE",
    message: `The variable "${variable}" is invalid.`,
}) as const;

// Defines a set of possible maths operations.
const mathsOpsSet = new Set([">", ">=", "=", "!"]);

// Validate an atomic non-set operation.
function validateAtomicNonSetOperation(operation: any, usedVariables: Set<Variable>): AtomicValidationError | null {
    if (!Array.isArray(operation)) {
        return {
            success: false,
            code: "INVALID_OPERATION",
            message: "The operation is not an array.",
        };
    }

    if (operation.length === 1) {
        // Simple get operation.

        const [variable] = operation;
        if (typeof variable !== "string") {
            return {
                success: false,
                code: "INVALID_VARIABLE",
                message: "The variable is not a string.",
            };
        }
        if (!usedVariables.has(variable)) {
            return invalidVar(variable);
        }
        return null;
    }

    // Make sure the maths operation is the right length.
    const pluckOpUsed = operation.length === 5;
    if (
        operation.length !== 4 &&
        !pluckOpUsed
    ) {
        return {
            success: false,
            code: "INVALID_OPERATION",
            message: "The operation is invalid.",
        };
    }

    // If the pluck operation is used, make sure it is a string array.
    if (pluckOpUsed) {
        if (!Array.isArray(operation[4]) || operation[4].some((attr) => typeof attr !== "string")) {
            return {
                success: false,
                code: "INVALID_PLUCK",
                message: "The pluck is invalid.",
            };
        }
    }

    // Validate the first argument.
    if (typeof operation[0] === "string") {
        if (!usedVariables.has(operation[0])) {
            // Used a variable that is not defined.
            return invalidVar(operation[0]);
        }
    } else if (
        !Array.isArray(operation[0]) || operation[0].length !== 1
    ) {
        return {
            success: false,
            code: "INVALID_VARIABLE",
            message: "The variable is invalid.",
        };
    }

    // Make sure the second argument is a variable that is defined.
    if (typeof operation[1] === "string") {
        if (!usedVariables.has(operation[1])) {
            return invalidVar(operation[1]);
        }
    } else {
        return {
            success: false,
            code: "INVALID_VARIABLE",
            message: "The variable is invalid.",
        };
    }

    // Check the maths operation is valid.
    if (!mathsOpsSet.has(operation[3])) {
        return {
            success: false,
            code: "INVALID_MATHS_OPERATION",
            message: "The maths operation is invalid.",
        };
    }

    // Return null if there are no errors.
    return null;
}

// Validate an assignment.
function validateAssignment(assignment: any): AtomicValidationError | string {
    if (typeof assignment === "string") {
        if (assignment === "") {
            return {
                success: false,
                code: "INVALID_VARIABLE",
                message: "The variable is empty.",
            };
        }
        return assignment;
    }
    if (!Array.isArray(assignment) || assignment.length !== 2) {
        return {
            success: false,
            code: "INVALID_ASSIGNMENT",
            message: "The assignment is invalid. Must be a [string, string[]] or a string.",
        };
    }
    const [variable, pluck] = assignment;
    if (typeof variable !== "string" || variable === "") {
        return {
            success: false,
            code: "INVALID_VARIABLE",
            message: "The variable is invalid.",
        };
    }
    if (
        !Array.isArray(pluck) ||
        pluck.some((attr) => typeof attr !== "string")
    ) {
        return {
            success: false,
            code: "INVALID_PLUCK",
            message: "The pluck is invalid.",
        };
    }
    return variable;
}

/**
 * Defines a validator for a bunch of atomic operations. This validates the following:
 *
 * - The array of atomic operations is non-empty and valid.
 * - Any variables are defined before they are used.
 * - The routes are valid.
 *
 * If the array is invalid, it returns a AtomicValidationError object. If not, it returns a
 * AtomicValidationSuccess object.
*/
export function validateAtomicItems<
    Handler extends UnauthenticatedRequestHandler<any, any> | AuthenticatedRequestHandler<any, any, any>,
>(items: any, routes: HandlerMapping<Handler>): AtomicValidationError | AtomicValidationSuccess<Handler> {
    // First make sure the items are an array and non-empty.
    if (!Array.isArray(items) || items.length === 0) {
        return {
            success: false,
            code: "INVALID_ARRAY",
            message: "The array of atomic operations is empty or not an array.",
        };
    }

    // Defines a set of variables that have been used.
    const usedVariables = new Set<Variable>();

    // Defines a map of routes to handlers.
    const handlers = new Map<Route, Handler>();

    // Go through each item in the array.
    for (const item of items) {
        // Make sure the item is an array.
        if (!Array.isArray(item)) {
            return {
                success: false,
                code: "INVALID_ITEM",
                message: "Each item in the array must be an array.",
            };
        }

        if (item.length === 1) {
            // This is a set operation. Validate this.
            const [setOp] = item;
            if (
                !Array.isArray(setOp) ||
                setOp.length !== 2 ||
                typeof setOp[0] !== "string"
            ) {
                return {
                    success: false,
                    code: "INVALID_SET_OPERATION",
                    message: "The set operation is invalid.",
                };
            }

            // Handle if the variable is blank.
            if (setOp[0] === "") {
                return {
                    success: false,
                    code: "INVALID_VARIABLE",
                    message: "The variable is empty.",
                };
            }

            // Add the variable to the used variables.
            usedVariables.add(setOp[0]);
        } else if (item.length === 2 || item.length === 3) {
            // Validate the route.
            if (typeof item[0] === "string") {
                // Standard "called with constant" route.

                const route = findRoute(item[0], routes);
                if (!route) {
                    return {
                        success: false,
                        code: "INVALID_ROUTE",
                        message: `The route "${item[0]}" is invalid.`,
                    };
                }
                handlers.set(item[0], route);
            } else {
                // An atomic non-set operation should be first. Lets check the route is valid first.
                if (typeof item[1] !== "string") {
                    return {
                        success: false,
                        code: "INVALID_ROUTE",
                        message: "The route is not a string.",
                    };
                }
                const route = findRoute(item[1], routes);
                if (!route) {
                    return {
                        success: false,
                        code: "INVALID_ROUTE",
                        message: `The route "${item[1]}" is invalid.`,
                    };
                }
                handlers.set(item[1], route);

                // Ok, lets validate the non-set operation.
                const err = validateAtomicNonSetOperation(item[0], usedVariables);
                if (err) {
                    return err;
                }
            }

            // If an assignment is present, validate this. The ordering here is important since
            // the variable is only used after it is defined.
            if (item.length === 3) {
                const res = validateAssignment(item[2]);
                if (typeof res === "string") {
                    usedVariables.add(res);
                } else {
                    return res;
                }
            }
        } else {
            // This is an invalid item because the length is wrong.
            return {
                success: false,
                code: "INVALID_ITEM",
                message: "The item is invalid.",
            };
        }
    }

    // Return the success.
    return {
        success: true,
        items: items as AtomicItem[],
        handlers,
    };
}
