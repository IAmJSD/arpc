type FilePath = string;

export type Routes = {
    [key: string]: Routes | FilePath;
};

export type Lockfile = {
    hasAuthentication: boolean;
    hasRatelimiting: boolean;
    exceptions: {[exceptionName: string]: FilePath};
    routes: Routes;
};
