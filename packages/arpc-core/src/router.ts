import request from "./request";
import {
    AuthHandler, AuthenticatedRequestHandler,
    HandlerMapping, UnauthenticatedRequestHandler,
} from "./schema";
import selfClient from "./selfClient";

type ExtractUser<Auth> = Auth extends AuthHandler<infer User, any> ? User : never;
type BodyErrorConstructor = new (body: any) => Error;

// Defines a router for creating RPC handlers.
export class RPCRouter<
    Handler, Routes extends { [key: string]: HandlerMapping<Handler> } = {},
    Auth extends AuthHandler<User, any> = AuthHandler<any, any>,
    Exceptions extends {[name: string]: BodyErrorConstructor} = {}, User = unknown, AuthSet = false
> {
    private _routes: Routes | null = null;
    private _auth: Auth | null = null;
    private _exceptions: Exceptions | null = null;

    // Set exceptions on the builder.
    setExceptions<Exceptions extends {[name: string]: BodyErrorConstructor}>(exceptions: Exceptions): RPCRouter<
        Handler, Routes, Auth, Exceptions, User, AuthSet,
    > {
        if (this._exceptions) throw new Error("Exceptions already set");
        const new_ = new RPCRouter<Handler, Routes, Auth, Exceptions, User, AuthSet>();
        new_._routes = this._routes;
        new_._auth = this._auth;
        new_._exceptions = exceptions;
        return new_;
    }

    // Set routes on the builder.
    setRoutes<
        Routes extends { [key: string]: HandlerMapping<Handler> }
    >(routes: Routes): RPCRouter<Handler, Routes, Auth, Exceptions, User, AuthSet> {
        if (this._routes) throw new Error("Routes already set");
        const new_ = new RPCRouter<Handler, Routes, Auth, Exceptions, User, AuthSet>();
        new_._routes = routes;
        new_._auth = this._auth;
        new_._exceptions = this._exceptions;
        return new_;
    }

    // Set the authentication handler.
    setAuthHandler<
        Auth extends AuthHandler<any, any>, User = ExtractUser<Auth>,
    >(
        auth: Auth
    ): RPCRouter<AuthenticatedRequestHandler<User>, {}, Auth, Exceptions, User, true> {
        if (this._auth) throw new Error("Auth handler already set");
        if (this._routes) throw new Error("Routes must be set after auth handler");
        const new_ = new RPCRouter<
            AuthenticatedRequestHandler<User>, {}, Auth, Exceptions, User, true
        >();
        new_._auth = auth;
        new_._exceptions = this._exceptions;
        return new_;
    }

    // Build the handler for web requests.
    buildHttpHandler(): (req: Request) => Promise<Response> {
        return request(this._routes, this._auth, this._exceptions);
    }

    // Build the handler for the internal API client. The signature of this
    // function changes based on the presence of an auth handler.
    get self() {
        return selfClient<User, Routes, AuthSet>(this._routes || {} as Routes, !!this._auth as AuthSet);
    }
}

// Helper function to create a new router.
export const router = () => new RPCRouter<UnauthenticatedRequestHandler>();
