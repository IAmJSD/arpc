import type { Enum } from "../BuildData";

// Defines the code shared between both the sync and async logic.
export const sharedCode = (async: boolean) => `_custom_exceptions = {}
_builtin_exceptions = {}


def _add_exception_cls(builtin: bool):
    def decorator(cls):
        if builtin:
            _builtin_exceptions[cls.__name__] = cls
        else:
            _custom_exceptions[cls.__name__] = cls
        return cls
    return decorator


class _Request(object):
    """Defines a request."""
    def __init__(self, method: str, mutation: bool, arg):
        self.method = method
        self.mutation = mutation
        self.arg = arg


class ClientException(Exception):
    """Defines a base exception."""
    def __init__(self, code: str, message: str, body=None):
        self.code = code
        self.message = message
        self.body = body
    
    
class _BaseCustomException(ClientException):
    """Defines the base custom exception."""
    def __init__(self, body):
        self.body = body


@_add_exception_cls(True)
class InvalidResponse(ClientException):
    """Defines an invalid response exception."""


class BatchError(ClientException):
    """Defines a batch error exception."""
    def __init__(self, errors):
        self.errors = errors

    def __str__(self):
        return f"BatchError(errors={self.errors})"


def _throw(body):
    if body.get("builtIn"):
        cls = _builtin_exceptions.get(body["name"])
        if cls:
            raise cls(body["code"], body["message"], body["body"])

        raise ClientException(body["code"], body["message"], body["body"])

    cls = _custom_exceptions.get(body["name"])
    if cls:
        raise cls(body["body"])

    raise ClientException("UNKNOWN_EXCEPTION", f"The exception '{body['name']}' is missing.", body)


class _BaseBatcher(object):
    """Defines the base batcher that all batchers inherit from."""
    def __init__(self, client):
        self._batch = []
        self._client = client

    ${async ? "async " : ""}def execute(self):
        """Executes the batch."""
        return ${async ? "await " : ""}self._client._do_request(self)


def _all_non_mutation(batch):
    for req in batch:
        if req[0].mutation:
            return False
    return True


def _process_batch(body, batch):
    for i, req in enumerate(batch):
        if req[1] is not None:
            body[i] = req[1](body[i])
    return body


def _arr_mutations(mutator):
    def fn(arr):
        if not isinstance(arr, list):
            return None
        return [mutator(x) for x in arr]
    return fn


def _dict_mutations(key_mutator, value_mutator):
    if not key_mutator:
        key_mutator = lambda x: x
    if not value_mutator:
        value_mutator = lambda x: x

    def fn(d):
        if not isinstance(d, dict):
            return None
        return {key_mutator(k): value_mutator(v) for k, v in d.items()}

    return fn


_actually_none = object()


def _is_none(obj):
    if obj is None:
        return _actually_none
    return None


def _process_union(*signatures):
    def fn(obj):
        for sig in signatures:
            res = sig(obj)
            if res is not None:
                if res is _actually_none:
                    return None
                return res
        raise ValueError("No union types matched.")

    return fn


def _is_type(t):
    def fn(obj):
        if isinstance(obj, t):
            return obj

        if hasattr(t, "__origin__") and t.__origin__ == list:
            if isinstance(obj, list):
                return [_is_type(t.__args__[0])(x) for x in obj]
            return None

        if hasattr(t, "__origin__") and t.__origin__ == dict:
            if isinstance(obj, dict):
                o = {}
                for k, v in obj.items():
                    k = _is_type(t.__args__[0])(k)
                    v = _is_type(t.__args__[1])(v)
                    if k is None or v is None:
                        return None
                    o[k] = v
                return o
            return None

        if hasattr(t, "__args__") and len(t.__args__) > 0:
            for arg in t.__args__:
                if obj == arg:
                    return obj
            return None

        return None

    return fn


def _is_eq(value):
    def fn(obj):
        if obj == value:
            return obj
        return None
    return fn`;

// Creates a enum.
export function createEnum(e: Enum) {
    let items = Array.from(e.data.keys()).sort().map((key) => {
        // Get the value.
        let value = e.data.get(key);
        if (typeof value === "string") value = `"${value}"`;
        else if (typeof value === "boolean") value = value ? "True" : "False";

        // Return the enum item.
        return `\n    ${key} = ${value}`;
    }).join("");
    if (items === "") items = "\n    pass";

    return `class ${e.name}:${items}`;
}

// Creates a exception.
export function createException(name: string, description: string, builtIn: boolean) {
    return `@_add_exception_cls(${builtIn ? "True" : "False"})
class ${name}(${builtIn ? "ClientException" : "_BaseCustomException"}):
    """${description}"""`;
}
