/** Typed application errors mapped to HTTP responses by the error middleware. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, "BAD_REQUEST", msg, details);
export const unauthorized = (msg = "Authentication required") => new AppError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "You do not have permission to do this", code = "FORBIDDEN") =>
  new AppError(403, code, msg);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (msg: string, code = "CONFLICT") => new AppError(409, code, msg);
export const unprocessable = (msg: string, code = "UNPROCESSABLE", details?: unknown) =>
  new AppError(422, code, msg, details);
export const tooMany = (msg = "Too many requests, please slow down") => new AppError(429, "RATE_LIMITED", msg);
