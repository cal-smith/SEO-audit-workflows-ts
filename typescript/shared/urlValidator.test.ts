import { describe, it, expect } from "vitest";
import { validateUrl, validateUrlOrThrow } from "./urlValidator.js";

describe("validateUrl", () => {
  describe("valid URLs", () => {
    it("accepts valid https URLs", () => {
      const result = validateUrl("https://example.com");
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("https://example.com");
    });

    it("accepts valid http URLs", () => {
      const result = validateUrl("http://example.com");
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("http://example.com");
    });

    it("adds https:// if no scheme provided", () => {
      const result = validateUrl("example.com");
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("https://example.com");
    });

    it("trims whitespace", () => {
      const result = validateUrl("  https://example.com  ");
      expect(result.valid).toBe(true);
      expect(result.normalizedUrl).toBe("https://example.com");
    });

    it("accepts URLs with paths", () => {
      const result = validateUrl("https://example.com/path/to/page");
      expect(result.valid).toBe(true);
    });

    it("accepts URLs with query strings", () => {
      const result = validateUrl("https://example.com?foo=bar");
      expect(result.valid).toBe(true);
    });

    it("accepts IP addresses (SSRF protection at network layer)", () => {
      const result = validateUrl("http://192.168.1.1");
      expect(result.valid).toBe(true);
    });
  });

  describe("rejected by validator.js (also caught by SSRF filter)", () => {
    it("rejects localhost", () => {
      const result = validateUrl("http://localhost");
      expect(result.valid).toBe(false);
    });
  });

  describe("invalid URLs", () => {
    it("rejects empty URL", () => {
      const result = validateUrl("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects whitespace-only URL", () => {
      const result = validateUrl("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects invalid URL format", () => {
      const result = validateUrl("not a valid url ::::");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid URL");
    });

    it("rejects non-HTTP schemes", () => {
      const result = validateUrl("ftp://example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid URL");
    });

    it("rejects file:// scheme", () => {
      const result = validateUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid URL");
    });

    it("rejects URLs with credentials", () => {
      const result = validateUrl("https://user:pass@example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("credentials");
    });

    it("rejects very long URLs", () => {
      const longUrl = "https://example.com/" + "a".repeat(3000);
      const result = validateUrl(longUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
    });
  });
});

describe("validateUrlOrThrow", () => {
  it("returns normalized URL for valid input", () => {
    const result = validateUrlOrThrow("example.com");
    expect(result).toBe("https://example.com");
  });

  it("throws error for invalid input", () => {
    expect(() => validateUrlOrThrow("ftp://example.com")).toThrow("Invalid URL");
  });
});
