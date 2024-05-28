import header from "./header";

// Defines a function to generate a exception.
function createException(name: string, description: string, builtIn: boolean) {
	// Make the description Go friendly.
	description = name + " " + description.substring(0, 1).toLowerCase() +
		description.substring(1);

	// Turn it into Go comments.
	description = description.split("\n").map((x) => "// " + x).join("\n");

	// Generate a built-in exception.
	if (builtIn) {
		return `// ${description}
type ${name} struct {
	// Code is the error code.
	Code string \`json:"code"\`

	// Message is the error message.
	Message string \`json:"message"\`

	// Body is the error body.
	Body msgpack.RawMessage \`json:"-"\`
}

// Error implements the error interface.
func (e ${name}) Error() string {
	return e.Message
}

func init() {
	builtInErrors["${name}"] = func(code, message string, body msgpack.RawMessage) error {
		return ${name}{
			Code:    code,
			Message: message,
			Body:    body,
		}
	}
}`;
	}

	// Generate a custom exception.
	return `// ${description}
type ${name} struct {
	// Body is the error body.
	Body msgpack.RawMessage \`json:"-"\`
}

// Error implements the error interface.
func (e ${name}) Error() string {
	return "server returned ${name}"
}

func init() {
	customErrors["${name}"] = func(body msgpack.RawMessage) error {
		return ${name}{
			Body: body,
		}
	}
}`;
}


