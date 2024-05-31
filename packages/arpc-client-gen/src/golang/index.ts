import type { Enum, Object, Methods, Client, Method, BuildData } from "../BuildData";
import header from "./header";
import { buildApiMethod } from "./methods";
import { getReturnType } from "./returnTypes";

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

// Creates a enum.
function createEnum(e: Enum, objects: Object[]) {
	// Defines the chunks for the enum.
	const chunks = [
		`type ${e.name} ${getReturnType(e.valueType, objects).type}`,
	];

	// Return here if there is no data.
	if (e.data.size === 0) return chunks[0];

	// Build the const start.
	chunks.push("\nconst (");

	// Go through each enum key.
	const keys = Array.from(e.data.keys()).sort();
	const first = keys.shift();
	function processKey(key: any, first: boolean) {
		// Defines the prefix.
		const prefix = first ? "" : "\n";

		// Push the chunk.
		chunks.push(`${prefix}	// ${e.name}${key} is the enum key for ${key}.
	${e.name}${key} ${e.name} = ${e.data.get(key)}`);
	}
	processKey(first, true);
	for (const key of keys) processKey(key, false);

	// Add the const end.
	chunks.push(")");

	// Return the chunks.
	return chunks.join("\n");
}

// Creates a object struct.
function createObject(obj: Object, objects: Object[]) {
	const keys = Object.keys(obj.fields).sort();
	if (keys.length === 0) {
		return `type ${obj.name} struct {}`;
	}

	const chunks: string[] = [];
	chunks.push(`type ${obj.name} struct {`);
	const longestKey = keys.reduce((a, b) => a.length > b.length ? a : b).length;
	for (const key of keys) {
		const field = obj.fields[key];
		const ret = getReturnType(field, objects);
		const attrName = key.slice(0, 1).toUpperCase() + key.slice(1);
		chunks.push(`	${attrName}${" ".repeat(longestKey - attrName.length)} ${ret.type} \`json:"${key}"\``);
	}
	chunks.push("}");
	return chunks.join("\n");
}

// Builds the client/batcher structs.
function buildApiStruct(
	enums: Enum[], objects: Object[], methods: Methods, namespace: string,
    prefix: string, description: string | null, pvt: boolean, isClient: boolean,
) {
	// Defines the struct name.
	const structName = `${pvt ? "api" : "API"}${prefix}${isClient ? "Client" : "Batcher"}`;

	const chunks: string[] = [];
	if (description) {
		// Add the struct name to the description.
		description = `${structName} defines ${description.substring(0, 1).toLowerCase()}${description.substring(1)}`;

		if (!pvt) {
			// Note that New<struct name> should be used to create a new instance.
			const descSplit = description.split("\n");
			descSplit[0] = `${descSplit[0]} Please use New${structName} to create a new instance.`;
			description = descSplit.join("\n");
		}

		// Write the description.
		chunks.push(
			description.split("\n").map((x) => `// ${x}`).join("\n"),
		);
	}

	// Write the header.
	chunks.push(`type ${structName} struct {`);

	// If this is a client or the first item in a batcher, include the client base.
	if (isClient || namespace === "") {
		chunks.push(`	base *clientBase`);
	}

	// If this isn't a client, include the request slice pointer.
	if (!isClient) {
		chunks.push(`	reqs *[]*request`);
	}

	// Go through and add the categories to the struct.
	const keys = Object.keys(methods).sort();
	let structItemLength = 0;
	const structCats: [string, string][] = [];
	const catChunks: string[] = [];
	for (const key of keys) {
		// Check if this is a category.
		const isCat = typeof methods[key].mutation !== "boolean";
		if (isCat) {
			// Get the struct item name.
			const itemName = key.slice(0, 1).toUpperCase() + key.slice(1);

			// If itemName's length is greater than structItemLength, set it.
			if (itemName.length > structItemLength) structItemLength = itemName.length;

			// Push it to the struct categories.
			const structName = `api${prefix}${itemName}${isClient ? "Client" : "Batcher"}`;
			structCats.push([itemName, structName]);
	
			// Recurse the category.
			catChunks.push(buildApiStruct(
				enums, objects, methods[key] as Methods,
				namespace === "" ? key : namespace + "." + key,
				prefix + itemName, null, true, isClient,
			));
		}
	}

	// Handle if there is any struct items that need adding.
	if (structItemLength > 0) {
		// Add the struct items to the top.
		chunks.unshift(catChunks.join("\n\n") + "\n");

		// Go through each struct item.
		chunks.push("");
		for (let [attr, structName] of structCats) {
			attr += " ".repeat(structItemLength - attr.length);
			chunks.push(`	${attr} *${structName}`);
		}
	}

	// Close the struct.
	chunks.push("}");

	// Build the methods.
	for (const key of keys) {
		const possibleMethod = methods[key];
		if (typeof possibleMethod.mutation === "boolean") {
			chunks.push("\n" + buildApiMethod(
				enums, objects, structName, key,
				namespace === "" ? key : `${namespace}.${key}`,
				possibleMethod as Method, isClient,
			));
		}
	}

	// Build the constructor input.
	let input = "base *clientBase";
	let structInit = "base: base";
	if (!isClient) {
		if (namespace === "") {
			// The main batcher has a different initializer.
			structInit += ", reqs: &[]*request{}";
		} else {
			// Sub-categories of batchers take a different input.
			input = "reqs *[]*request";
			structInit = "reqs: reqs";
		}
	}

	// Build all required dynamic bits.
	const initChunks: string[] = [];
	const subarg = isClient ? "base" : "s.reqs";
	for (const [attr, structName] of structCats) {
		initChunks.push(`\n	s.${attr} = newA${structName.substring(1)}(${subarg})`);
	}

	// Build the init.
	chunks.push(`
func newApi${structName.substring(3)}(${input}) *${structName} {
	s := &${structName}{${structInit}}${initChunks.join("")}
	return s
}`);

	// Join the chunks by a newline.
	return chunks.join("\n");
}

// Defines the client constructor.
function clientConstructor(client: Client) {
	// Defines the URL logic.
	const urlLogic = `if opts.Hostname == "" {
		opts.Hostname = "${client.defaultProtocol}://${client.defaultHostname}"
	}

	protoStep := 0
api${client.apiVersion}ClientProtoLoop:
	for _, v := range opts.Hostname {
		switch v {
		case ':':
			protoStep = 1
		case '/':
			if protoStep != 0 {
				protoStep++
			}
			if protoStep == 3 {
				break api${client.apiVersion}ClientProtoLoop
			}
		default:
			protoStep = 0
		}
	}
	if protoStep != 3 {
		opts.Hostname = "${client.defaultProtocol}://" + opts.Hostname
	}

	u, err := url.Parse(opts.Hostname)
	if err != nil {
		return nil, err
	}
	u.Path = "/api/rpc"
	u.RawQuery = "version=${client.apiVersion}"
	urlStr := u.String()`;

	// Handle the no auth case.
	const prefix = `API${client.apiVersion.toUpperCase()}`;
	const optsStructName = `${prefix}Opts`;
	if (!client.authentication) {
		return `// ${optsStructName} defines the options for the API client.
type ${optsStructName} struct {
	// Client is the HTTP client to use. If left blank, defaults to http.DefaultClient.
	Client *http.Client \`json:"client"\`

	// Hostname is the hostname to connect to. If left blank, defaults to ${client.defaultHostname}.
	Hostname string \`json:"hostname"\`
}

// New${prefix}Client creates a new API client.
func New${prefix}Client(opts ${optsStructName}) (*${prefix}Client, error) {
	${urlLogic}

	httpClient := opts.Client
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	c := &clientBase{
		c:   httpClient,
		url: urlStr,
	}
	return newApi${client.apiVersion.toUpperCase()}Client(c), nil
}`;
	}

	// Defines a enum for the token types.
	const tokenKeys = Object.keys(client.authentication.tokenTypes).sort();
	const tokenType = `// ${prefix}TokenType defines the type that all token types will use.
type ${prefix}TokenType string

const (
${tokenKeys.map((key) => {
	const value = client.authentication!.tokenTypes[key];
	return `    // ${prefix}TokenType${key} is the token type for ${key}.
	${prefix}TokenType${key} ${prefix}TokenType = "${value}"`;
}).join("\n\n")}
)`;

	// Defines the defaults to comment.
	const typeDefaultsTo = client.authentication.defaultTokenType
		? `Defaults to ${client.authentication.defaultTokenType}.`
		: "Will error if not set.";

	// Handle if the token type is required.
	const throwOrDefault = client.authentication.defaultTokenType
		? `o.TokenType = ${prefix}TokenType${client.authentication.defaultTokenType}`
		: `return "", errors.New("token type is required")`;

	// Return the text.
	return `${tokenType}

// ${optsStructName}Auth defines the options for the API client with authentication.
type ${optsStructName}Auth struct {
	// Token defines the token to use for authentication. Will error if not set.
	Token string \`json:"token"\`

	// TokenType defines the type of token to use for authentication. ${typeDefaultsTo}
	TokenType ${prefix}TokenType \`json:"token_type"\`
}

func (o ${optsStructName}Auth) str() (string, error) {
	if o.Token == "" {
		return "", errors.New("token is required")
	}

	if o.TokenType == "" {
		${throwOrDefault}
	}

	typeMapping := map[${prefix}TokenType]string{
${tokenKeys.map((key) => `		${prefix}TokenType${key}: "${client.authentication!.tokenTypes[key]}",`).join("\n")}
	}
	webTerm, ok := typeMapping[o.TokenType]
	if !ok {
		return "", errors.New("invalid token type")
	}

	return webTerm + " " + o.Token, nil
}

// ${optsStructName} defines the options for the API client.
type ${optsStructName} struct {
	// Authentication is the authentication options to use. If nil, no authentication is used.
	Authentication *${optsStructName}Auth \`json:"authentication"\`

	// Client is the HTTP client to use. If left blank, defaults to http.DefaultClient.
	Client *http.Client \`json:"client"\`

	// Hostname is the hostname to connect to. If left blank, defaults to ${client.defaultHostname}.
	Hostname string \`json:"hostname"\`
}

// New${prefix}Client creates a new API client.
func New${prefix}Client(opts ${optsStructName}) (*${prefix}Client, error) {
	${urlLogic}

	httpClient := opts.Client
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	headers := map[string]string{}
	if opts.Authentication != nil {
		auth, err := opts.Authentication.str()
		if err != nil {
			return nil, err
		}
		headers["Authorization"] = auth
	}

	c := &clientBase{
		c:       httpClient,
		url:     urlStr,
		headers: headers,
	}
	return newApi${client.apiVersion.toUpperCase()}Client(c), nil
}`;
}

// Creates the client structures and initializer.
function createClient(enums: Enum[], objects: Object[], client: Client) {
	// Build the batcher.
	const prefix = `V${client.apiVersion}`;
	const batcherStruct = buildApiStruct(
		enums, objects, client.methods, "", prefix, null, true, false,
	);

	// Build the client.
	const clientStruct = buildApiStruct(
		enums, objects, client.methods, "", prefix, client.description, false, true,
	);

	// Build the extra functions needed to bootstrap everything and return it with the structs.
	return batcherStruct + "\n\n" + clientStruct + `

// Execute executes the batch request.
func (c *api${prefix}Batcher) Execute(ctx context.Context) ([]any, error) {
	resp, err := c.base.do(ctx, *c.reqs)
	if err != nil {
		return nil, err
	}
	return resp.([]any), nil
}

// Batcher returns a new batcher for the API.
func (c *API${prefix}Client) Batcher() *api${prefix}Batcher {
	return newApi${prefix}Batcher(c.base)
}

${clientConstructor(client)}`;
}

// Defines the main function to take the build data and turn it into Go code.
export function golang(data: BuildData) {
    const chunks = [header];

    for (const e of data.enums) {
        chunks.push(createEnum(e, data.objects));
    }

    for (const o of data.objects) {
        chunks.push(createObject(o, data.objects));
    }

    for (const e of data.builtinExceptions) {
        chunks.push(createException(e.name, e.description, true));
    }

    for (const e of data.customExceptions) {
        chunks.push(createException(e.name, e.description, false));
    }

    for (const c of data.clients) {
        chunks.push(createClient(data.enums, data.objects, c));
    }

    return chunks.join("\n\n"); 
}
