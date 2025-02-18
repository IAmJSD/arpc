import { PluckAttributeTree } from "./atomic";
import { callRouteWithConstant, callRouteWithVariable, setVariableToConstant } from "./atomicOps";
import { doInternalTagging, getInternalTag } from "./notTypeSafeBeCareful";

type VariableSetOperation<T> = {
    " $ARPC_INTERNAL_type": "set";
    value: T | RouteCall<any, T>;
    assignTo: string;
};

type Variable<T> = {
    " $ARPC_INTERNAL_type": "variable";
    name: string;
    set: (value: T) => VariableSetOperation<T>;
};

type RouteCall<In, Out> = {
    " $ARPC_INTERNAL_type": "route";
    " $ARPC_INTERNAL_output_type": Out;
    route: string;
    arg: In | Variable<In>;
    objPath?: string[];
};

type PluckAway<T, Pluck extends string[] | undefined> = Pluck extends undefined ? T
    // @ts-expect-error: This is a recursive type that will error if the key is not found
    : Pluck extends [infer Head, ...infer Tail] ? Head extends keyof T ? PluckAway<T[Head], Tail> : never
    : never;

export function routeCall<
    In,
    Pluck extends string[] | undefined,
    Out,
>(
    route: string, arg: In | Variable<In>, pluck?: Pluck,
): RouteCall<In, PluckAway<Out, Pluck>> {
    if (typeof route !== "string") {
        throw new Error("Route must be a string");
    }

    // @ts-expect-error: This is a fake type to make the type checker happy
    return doInternalTagging("route", {
        route,
        arg,
        objPath: pluck,
        " $ARPC_INTERNAL_output_type": null,
    });
}

export function variable<T>(name: string): Variable<T> {
    if (typeof name !== "string") {
        throw new Error("Variable name must be a string");
    }
    return doInternalTagging("variable", {
        name,
        set: (value: T | RouteCall<any, T>) => doInternalTagging("set", {
            value, assignTo: name,
        }),
    });
}

type ResolveServerQuery<T> =
    T extends VariableSetOperation<infer U> ? U
    : T extends RouteCall<infer _, infer U> ? U
    : never;

function compileRouteCall(
    query: RouteCall<any, any>,
    assignTo: string | null,
    ifThis: [string, any, ">" | ">=" | "=" | "!", PluckAttributeTree | null] | null,
) {
    if (getInternalTag(query.arg)) {
        return callRouteWithVariable(query.route, query.arg, assignTo, ifThis);
    }
    return callRouteWithConstant(query.route, query.arg, assignTo, ifThis);
}

function compilerTagRizzler<
    T extends VariableSetOperation<any> | RouteCall<any, any>,
>(
    query: T, tagName: string, variableName: string | null,
    ifThis: [string, any, ">" | ">=" | "=" | "!", PluckAttributeTree | null] | null,
) {
    switch (tagName) {
        case "route": {
            return compileRouteCall(query as RouteCall<any, any>, variableName, ifThis);
        }
    }
    throw new Error("Invalid tag");
}

function compileIntoServerQuery<
    T extends VariableSetOperation<any> | RouteCall<any, any>,
>(query: T): ResolveServerQuery<T> {
    if (typeof query === "object" && query !== null) {
        let tag = getInternalTag(query);
        switch (tag) {
            case "set": {
                tag = getInternalTag((query as VariableSetOperation<any>).value);
                if (!tag) {
                    return setVariableToConstant(
                        query.assignTo, query.value,
                    ) as unknown as ResolveServerQuery<T>;
                }
                return compilerTagRizzler(query.value, tag, query.value) as unknown as ResolveServerQuery<T>;
            }
        }
    }
    throw new Error("Invalid query");
}
