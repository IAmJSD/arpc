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
export type AtomicMathsOperation = MathsBase | [...MathsBase, PluckAttributeTree];

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
