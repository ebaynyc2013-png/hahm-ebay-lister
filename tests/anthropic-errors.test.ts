import { describe, expect, it } from "vitest";
import { anthropicAuthError, anthropicReason } from "@/lib/anthropic";

// 30 Oct 2026: a 403 came back with no reason shown, and we could only guess.
// The seller now sees Anthropic's own words.
const sdk403 = {
  status: 403,
  error: {
    type: "error",
    error: {
      type: "permission_error",
      message: "Your organization does not have access to this model.",
    },
  },
  message:
    '403 {"type":"error","error":{"type":"permission_error","message":"Your organization does not have access to this model."}}',
};

describe("Anthropic's own reason reaches the seller", () => {
  it("reads the reason from the error body", () => {
    expect(anthropicReason(sdk403)).toBe(
      "Your organization does not have access to this model.",
    );
  });

  it("reads it from the message text when there is no body", () => {
    expect(
      anthropicReason({ status: 403, message: sdk403.message }),
    ).toBe("Your organization does not have access to this model.");
    expect(anthropicReason({ status: 403, message: "403 Request not allowed" })).toBe(
      "Request not allowed",
    );
  });

  it("puts the reason into the 403 message the card shows", () => {
    const err = anthropicAuthError(sdk403);
    expect(err?.status).toBe(403);
    expect(err?.message).toContain("(403)");
    expect(err?.message).toContain(
      'Anthropic says: "Your organization does not have access to this model."',
    );
  });

  it("never shows an API key, and stays short", () => {
    const reason = anthropicReason({
      status: 401,
      error: { error: { message: `invalid x-api-key sk-ant-api03-abcDEF_123-xyz ${"x".repeat(500)}` } },
    });
    expect(reason).not.toContain("sk-ant");
    expect(reason).toContain("[key]");
    expect(reason.length).toBeLessThanOrEqual(300);
  });

  it("keeps the old message when Anthropic gives no reason", () => {
    const err = anthropicAuthError({ status: 403 });
    expect(err?.message).toContain("(403)");
    expect(err?.message).not.toContain("Anthropic says");
  });

  it("leaves other errors alone", () => {
    expect(anthropicAuthError({ status: 500, message: "overloaded" })).toBeNull();
  });
});
