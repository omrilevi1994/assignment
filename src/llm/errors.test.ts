import {
  APICallError,
  NoContentGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";
import { describe, expect, it } from "vitest";
import { GatewayError, classifyError, isRetryable, toGatewayError } from "./errors";

const response = { id: "r1", timestamp: new Date(0), modelId: "m" };
const usage = {
  inputTokens: 1,
  inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokens: 1,
  outputTokenDetails: { textTokens: 1, reasoningTokens: undefined },
  totalTokens: 2,
};

function apiError(statusCode: number): APICallError {
  return new APICallError({ message: `HTTP ${statusCode}`, url: "https://x", requestBodyValues: {}, statusCode });
}

function noObject(text: string): NoObjectGeneratedError {
  return new NoObjectGeneratedError({ text, response, usage, finishReason: "stop" });
}

describe("classifyError", () => {
  it("maps provider HTTP failures to provider_error", () => {
    expect(classifyError(apiError(500))).toBe("provider_error");
    expect(classifyError(apiError(429))).toBe("provider_error");
    expect(classifyError(apiError(400))).toBe("provider_error");
  });

  it("maps abort and timeout errors to timeout", () => {
    expect(classifyError(new DOMException("timed out", "TimeoutError"))).toBe("timeout");
    expect(classifyError(new DOMException("aborted", "AbortError"))).toBe("timeout");
  });

  it("maps an unparsable or schema-violating answer to invalid_output", () => {
    expect(classifyError(noObject('{"answer": 42}'))).toBe("invalid_output");
    expect(classifyError(new TypeValidationError({ value: 1, cause: new Error("bad") }))).toBe("invalid_output");
  });

  it("maps a blank answer or a missing output to empty_output", () => {
    expect(classifyError(noObject("  \n"))).toBe("empty_output");
    expect(classifyError(new NoOutputGeneratedError())).toBe("empty_output");
    expect(classifyError(new NoContentGeneratedError())).toBe("empty_output");
  });

  it("keeps the kind of an existing GatewayError", () => {
    expect(classifyError(new GatewayError("empty_output", "blank"))).toBe("empty_output");
  });

  it("classifies a retry wrapper by its last error", () => {
    const wrapped = new RetryError({ message: "failed", reason: "maxRetriesExceeded", errors: [apiError(500), noObject("x")] });
    expect(classifyError(wrapped)).toBe("invalid_output");
  });

  it("falls back to provider_error for anything unknown", () => {
    expect(classifyError(new Error("boom"))).toBe("provider_error");
    expect(classifyError("not an error")).toBe("provider_error");
  });
});

describe("isRetryable", () => {
  it("retries timeouts, rate limits and provider 5xx", () => {
    expect(isRetryable("timeout", undefined)).toBe(true);
    expect(isRetryable("provider_error", 429)).toBe(true);
    expect(isRetryable("provider_error", 500)).toBe(true);
    expect(isRetryable("provider_error", 503)).toBe(true);
  });

  it("does not retry other 4xx, unknown statuses or bad output", () => {
    expect(isRetryable("provider_error", 400)).toBe(false);
    expect(isRetryable("provider_error", 401)).toBe(false);
    expect(isRetryable("provider_error", undefined)).toBe(false);
    expect(isRetryable("invalid_output", undefined)).toBe(false);
    expect(isRetryable("empty_output", undefined)).toBe(false);
  });
});

describe("toGatewayError", () => {
  it("wraps an SDK error with its kind, status, cause and retry flag", () => {
    const cause = apiError(502);
    const error = toGatewayError(cause, true);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ kind: "provider_error", status: 502, retried: true, cause });
    expect(error.message).toContain("HTTP 502");
  });

  it("takes the status from the last error of a retry wrapper", () => {
    const wrapped = new RetryError({ message: "failed", reason: "maxRetriesExceeded", errors: [apiError(500), apiError(503)] });
    expect(toGatewayError(wrapped, false)).toMatchObject({ kind: "provider_error", status: 503 });
  });

  it("returns an existing GatewayError with the retry flag updated", () => {
    const original = new GatewayError("empty_output", "blank");
    expect(toGatewayError(original, true)).toMatchObject({ kind: "empty_output", retried: true, message: "blank" });
  });
});
