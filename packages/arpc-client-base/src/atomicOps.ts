import type { Assignment, AtomicItem, AtomicMathsOperation, PluckAttributeTree } from "./atomic";

function validateAssignment(assignTo: Assignment): void {
    if (typeof assignTo !== "string") {
        // Validate as [string, string[]]
        if (!Array.isArray(assignTo) || assignTo.length !== 2) {
            throw new Error("Assign to must be a string or [string, string[]]");
        }
        if (typeof assignTo[0] !== "string") {
            throw new Error("Variable to assign to must be a string");
        }
        if (!Array.isArray(assignTo[1])) {
            throw new Error("Attribute tree must be an array");
        }
        if (assignTo[1].length === 0) {
            throw new Error("Attribute tree must not be empty");
        }
        for (const attribute of assignTo[1]) {
            if (typeof attribute !== "string") {
                throw new Error("Attribute must be a string");
            }
        }
    }
}

const allowedSet = new Set([">", ">=", "=", "!"]);

function validateIfThis(
    ifThis: [string, any, ">" | ">=" | "=" | "!", PluckAttributeTree | null],
): void {
    if (!Array.isArray(ifThis) || ifThis.length !== 4) {
        throw new Error("If this must be a [Variable, ConstantArgument, '>' | '>=' | '=' | '!', string[]]");
    }
    if (typeof ifThis[0] !== "string") {
        throw new Error("Variable must be a string");
    }
    if (!allowedSet.has(ifThis[2])) {
        throw new Error("Invalid operator");
    }
    if (ifThis[3]) {
        if (!Array.isArray(ifThis[3])) {
            throw new Error("Attribute tree must be an array");
        }
        for (const attribute of ifThis[3]) {
            if (typeof attribute !== "string") {
                throw new Error("Attribute must be a string");
            }
        }
    }
}

export function callRouteWithConstant(
    route: string, constant: any, assignTo: Assignment | null,
    ifThis: [string, any, ">" | ">=" | "=" | "!", PluckAttributeTree | null] | null,
): AtomicItem {
    if (typeof route !== "string") {
        throw new Error("Route must be a string");
    }

    if (ifThis) {
        validateIfThis(ifThis);
        const x: AtomicMathsOperation = [
            [constant], ifThis[0], ifThis[1], ifThis[2],
        ];
        if (ifThis[3]) {
            x.push(ifThis[3]);
        }
        if (assignTo) {
            validateAssignment(assignTo);
            return [x, route, assignTo];
        }
        return [x, route];
    }

    if (assignTo) {
        validateAssignment(assignTo);
        return [route, constant, assignTo];
    }
    return [route, constant];
}

export function callRouteWithVariable(
    route: string, variable: string, assignTo: Assignment | null,
    ifThis: [string, any, ">" | ">=" | "=" | "!", PluckAttributeTree | null] | null,
): AtomicItem {
    if (typeof route !== "string") {
        throw new Error("Route must be a string");
    }
    if (typeof variable !== "string") {
        throw new Error("Variable must be a string");
    }

    if (ifThis) {
        validateIfThis(ifThis);
        const x: AtomicMathsOperation = [
            variable, ifThis[0], ifThis[1], ifThis[2],
        ];
        if (ifThis[3]) {
            x.push(ifThis[3]);
        }
        if (assignTo) {
            validateAssignment(assignTo);
            return [x, route, assignTo];
        }
        return [x, route];
    }

    if (assignTo) {
        validateAssignment(assignTo);
        return [[route], variable, assignTo];
    }
    return [[route], variable];
}

export function setVariableToConstant(variable: string, value: any): AtomicItem {
    if (typeof variable !== "string") {
        throw new Error("Variable must be a string");
    }
    return [[variable, value]];
}
