import {
  APICallError,
  EmptyResponseBodyError,
  JSONParseError,
  NoContentGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";

/** The four ways a model call can fail, as seen by the pipeline. */
export type GatewayErrorKind = "provider_error" | "timeout" | "invalid_output" | "empty_output";

/** Extra context attached to a GatewayError. */
export type GatewayErrorOptions = { retried?: boolean; status?: number; cause?: unknown };

/** A failed model call, reduced to one of four kinds the pipeline can act on. */
export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;
  readonly retried: boolean;
  readonly status?: number;

  /** Builds an error of the given kind; `cause` keeps the original SDK error. */
  constructor(kind: GatewayErrorKind, message: string, options: GatewayErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "GatewayError";
    this.kind = kind;
    this.retried = options.retried ?? false;
    this.status = options.status;
  }
}

const ABORT_ERROR_NAMES = ["AbortError", "TimeoutError"];
const EMPTY_OUTPUT_ERRORS = [NoOutputGeneratedError, NoContentGeneratedError, EmptyResponseBodyError];
const INVALID_OUTPUT_ERRORS = [TypeValidationError, JSONParseError];

/** True for the errors `fetch` and the SDK raise when an abort signal fires. */
function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" && ABORT_ERROR_NAMES.includes(name);
}

/** True when the model produced no text or only whitespace. */
function isBlank(text: string | undefined): boolean {
  return (text ?? "").trim() === "";
}

/** Classifies output problems (blank, unparsable, off-schema); undefined for anything else. */
function outputKind(err: unknown): GatewayErrorKind | undefined {
  if (NoObjectGeneratedError.isInstance(err)) return isBlank(err.text) ? "empty_output" : "invalid_output";
  if (EMPTY_OUTPUT_ERRORS.some((type) => type.isInstance(err))) return "empty_output";
  if (INVALID_OUTPUT_ERRORS.some((type) => type.isInstance(err))) return "invalid_output";
  return undefined;
}

/** Maps any error thrown by the AI SDK or the provider to a gateway error kind. */
export function classifyError(err: unknown): GatewayErrorKind {
  if (err instanceof GatewayError) return err.kind;
  if (RetryError.isInstance(err)) return classifyError(err.lastError);
  if (isAbortError(err)) return "timeout";
  return outputKind(err) ?? "provider_error";
}

/** Only timeouts, rate limits (429) and provider 5xx are worth a second attempt. */
export function isRetryable(kind: GatewayErrorKind, status: number | undefined): boolean {
  if (kind === "timeout") return true;
  if (kind !== "provider_error" || status === undefined) return false;
  return status === 429 || status >= 500;
}

/** The HTTP status behind an error, when there is one. */
function statusOf(err: unknown): number | undefined {
  if (RetryError.isInstance(err)) return statusOf(err.lastError);
  return APICallError.isInstance(err) ? err.statusCode : undefined;
}

/** Wraps any error as a GatewayError, keeping the original as `cause`. */
export function toGatewayError(err: unknown, retried: boolean): GatewayError {
  if (err instanceof GatewayError) {
    return new GatewayError(err.kind, err.message, { retried, status: err.status, cause: err.cause });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new GatewayError(classifyError(err), message, { retried, status: statusOf(err), cause: err });
}
