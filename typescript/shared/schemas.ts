/**
 * Request/Response Schemas using Zod
 *
 * Centralized validation schemas for API request bodies.
 */

import { z } from "zod";

/**
 * Schema for the /audit POST request body
 */
export const AuditRequestSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .max(2048, "URL is too long (max 2048 characters)"),
  max_pages: z
    .number()
    .int("max_pages must be an integer")
    .min(1, "max_pages must be at least 1")
    .max(100, "max_pages cannot exceed 100")
    .default(25),
  max_concurrency: z
    .number()
    .int("max_concurrency must be an integer")
    .min(1, "max_concurrency must be at least 1")
    .max(50, "max_concurrency cannot exceed 50")
    .default(10),
});

export type AuditRequest = z.infer<typeof AuditRequestSchema>;

/**
 * Helper function to validate request body with Zod schema
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Format errors nicely (compatible with Zod v4)
  const issues = result.error.issues || [];
  const errorMessages = issues
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("; ");
  return { success: false, error: errorMessages || "Validation failed" };
}
