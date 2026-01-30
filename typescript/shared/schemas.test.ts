import { describe, it, expect } from "vitest";
import { AuditRequestSchema, validateRequest } from "./schemas.js";

describe("AuditRequestSchema", () => {
  describe("valid requests", () => {
    it("accepts valid request with all fields", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_pages: 50,
        max_concurrency: 20,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe("https://example.com");
        expect(result.data.max_pages).toBe(50);
        expect(result.data.max_concurrency).toBe(20);
      }
    });

    it("applies default values when fields are missing", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.max_pages).toBe(25);
        expect(result.data.max_concurrency).toBe(10);
      }
    });

    it("accepts minimum valid values", () => {
      const result = AuditRequestSchema.safeParse({
        url: "a",
        max_pages: 1,
        max_concurrency: 1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts maximum valid values", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_pages: 100,
        max_concurrency: 50,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid requests", () => {
    it("rejects missing url", () => {
      const result = AuditRequestSchema.safeParse({
        max_pages: 25,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty url", () => {
      const result = AuditRequestSchema.safeParse({
        url: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects max_pages below minimum", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_pages: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects max_pages above maximum", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_pages: 101,
      });
      expect(result.success).toBe(false);
    });

    it("rejects max_concurrency below minimum", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_concurrency: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects max_concurrency above maximum", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_concurrency: 51,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer max_pages", () => {
      const result = AuditRequestSchema.safeParse({
        url: "https://example.com",
        max_pages: 25.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects URL that is too long", () => {
      const result = AuditRequestSchema.safeParse({
        url: "a".repeat(2049),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("validateRequest", () => {
  it("returns success with data for valid input", () => {
    const result = validateRequest(AuditRequestSchema, {
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://example.com");
    }
  });

  it("returns formatted error for invalid input", () => {
    const result = validateRequest(AuditRequestSchema, {
      max_pages: 25,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("url");
    }
  });
});
