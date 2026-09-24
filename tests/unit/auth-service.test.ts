import { describe, expect, it, vi } from "vitest";
import { requestVerification } from "../../lib/auth/service";

describe("verification service", () => {
  it("rejects an ineligible address before a delivery attempt", async () => {
    const send = vi.fn();
    await expect(
      requestVerification(null, "person@example.com", send),
    ).rejects.toThrow("ELIGIBLE_EMAIL_REQUIRED");
    expect(send).not.toHaveBeenCalled();
  });
});
