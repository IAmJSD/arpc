export class BatchError extends Error {
    constructor(public errors: Error[]) {
        super(errors.map((error) => error.message).join(", "));
    }
}
