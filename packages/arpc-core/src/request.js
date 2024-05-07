export default (routes, auth, exceptions) => {
    // Flat pack the supported token types into a map of lower case strings to the
    // token type.
    const tokenTypeMap = new Map();
    if (auth) {
        for (const type of Object.values(auth.tokenTypes)) {
            tokenTypeMap.set(type.toLowerCase(), type);
        }
    }

    // Handle custom exceptions.
    const handleExceptions = (err) => {
        const className = err.constructor.name;
        if (className in exceptions) {
            // Return this as a response.
            // TODO
        }
        throw e;
    };

    /**
     * The internal handler for the request.
     * 
     * @param {Request} req: The request object.
     * @returns {Promise<Response>} The response object.
     */
    return async function handler(req) {
        // Handle user authentication.
        let user = null;
        const authHeader = req.headers.get("Authorization");
        if (auth && authHeader) {
            // Split the header into the type and the token.
            const [type, token] = authHeader.split(" ");
            if (!token) {
                return builtInError("BadRequest", "MISSING_TOKEN", "Missing token from Authorization header");
            }

            // Check if the token type is valid.
            const tokenType = tokenTypeMap.get(type.toLowerCase());
            if (!tokenType) return builtInError("Unauthorized", "BAD_TOKEN_TYPE", "Invalid token type");

            // Authenticate the user.
            try {
                user = await auth.validate(token, tokenType);
            } catch (err) {
                return handleExceptions(err);
            }
            if (user === null) {
                return builtInError("Unauthorized", "INVALID_TOKEN", "Invalid token");
            }
        }

        
    };
};
