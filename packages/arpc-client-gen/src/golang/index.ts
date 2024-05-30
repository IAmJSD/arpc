import { Enum, Object, Methods, Client } from "../BuildData";
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

	// If this is a client or the first item in a batcher, include the client core.
	if (isClient || namespace === "") {
		chunks.push(`	core *clientCore`);
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

	// TODO: Methods

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
