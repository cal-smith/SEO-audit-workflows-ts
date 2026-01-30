/**
 * URL Validation
 *
 * Uses validator.js for URL validation.
 * SSRF protection is handled by ssrf-req-filter at the network layer.
 */

import validator from "validator";

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
}

const URL_OPTIONS: validator.IsURLOptions = {
  protocols: ["http", "https"],
  require_protocol: false,
  require_host: true,
  require_valid_protocol: true,
  allow_underscores: false,
  allow_protocol_relative_urls: false,
};

const MAX_URL_LENGTH = 2048;

/**
 * Validate and normalize a URL for the audit
 */
export function validateUrl(urlString: string): UrlValidationResult {
  const trimmed = urlString.trim();

  if (!trimmed) {
    return { valid: false, error: "URL is required" };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, error: "URL is too long (max 2048 characters)" };
  }

  // Check for credentials in URL
  if (trimmed.includes("@") && /\/\/[^/]*:[^/]*@/.test(trimmed)) {
    return { valid: false, error: "URLs with credentials are not allowed" };
  }

  // Add https:// if no protocol
  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const normalizedUrl = hasProtocol ? trimmed : `https://${trimmed}`;

  // Validate with validator.js
  if (!validator.isURL(normalizedUrl, URL_OPTIONS)) {
    return { valid: false, error: "Invalid URL format" };
  }

  return { valid: true, normalizedUrl };
}

/**
 * Validate and normalize a URL, throwing an error if invalid
 */
export function validateUrlOrThrow(urlString: string): string {
  const result = validateUrl(urlString);
  if (!result.valid || !result.normalizedUrl) {
    throw new Error(result.error ?? "Invalid URL");
  }
  return result.normalizedUrl;
}
