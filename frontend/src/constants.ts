/**
 * Shared constants for the SEO Audit frontend
 */

// Default audit configuration
export const AUDIT_DEFAULTS = {
  MAX_PAGES: 25,
  MAX_CONCURRENCY: 5,
  DEFAULT_URL: 'https://render.com/docs',
} as const

// Category labels for SEO issues
export const CATEGORY_LABELS: Record<string, string> = {
  meta_tags: 'META',
  links: 'LINKS',
  headings: 'HEADINGS',
  images: 'IMAGES',
  performance: 'PERF',
}
