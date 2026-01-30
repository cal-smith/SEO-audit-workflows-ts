/**
 * SEO Auditor Workflow Tasks
 *
 * Defines Render Workflow tasks for distributed SEO analysis.
 * Each task runs in its own compute instance and can spawn other tasks.
 */

import { task } from "@renderinc/sdk/workflows";
import {
    checkHeadings,
    checkImages,
    checkLinks,
    checkMetaTags,
    checkPerformance,
    discoverPages,
    fetchPage,
} from "./analyzers.js";

interface AuditResult {
    url: string;
    pages_analyzed: number;
    failed_pages: Array<{ url: string; error: string }>;
    total_issues: number;
    issues_by_category: Record<string, number>;
    results: PageResult[];
}

interface PageResult {
    url: string;
    issues: Record<string, Issue[]>;
    load_time_ms?: number;
    content_length?: number;
    error?: string;
}

interface Issue {
    type: "error" | "warning" | "info";
    message: string;
    url: string;
    value?: string;
    link?: string;
}

/**
 * Helper to process items in batches with controlled concurrency.
 */
async function processBatches<T, R>(
    items: T[],
    batchSize: number,
    processor: (item: T) => R | Promise<R>
): Promise<PromiseSettledResult<Awaited<R>>[]> {
    const results: PromiseSettledResult<Awaited<R>>[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
            batch.map((item) => Promise.resolve(processor(item)))
        );
        results.push(...batchResults);
    }

    return results;
}

/**
 * Main entry point for SEO audits.
 *
 * Crawls the site to discover pages, then spawns analyze_page tasks
 * with controlled concurrency for each discovered page.
 */
task(
    {
        name: "audit_site",
        retry: {
            maxRetries: 2,
            waitDurationMs: 1000,
            backoffScaling: 1.5,
        },
    },
    async (url: string, maxPages: number = 25, maxConcurrency: number = 10): Promise<AuditResult> => {
        const cappedMaxPages = Math.min(maxPages, 100);
        const cappedConcurrency = Math.min(Math.max(maxConcurrency, 1), 50);

        // Discover pages (runs as a separate task)
        const pages = await crawlPages(url, cappedMaxPages);

        if (pages.length === 0) {
            return {
                url,
                pages_analyzed: 0,
                failed_pages: [],
                total_issues: 0,
                issues_by_category: {},
                results: [],
            };
        }

        // Spawn analyze_page tasks with controlled concurrency
        // Tasks are batched to limit parallel execution
        const results = await processBatches(pages, cappedConcurrency, analyzePage);

        // Filter out failed results and aggregate
        const successfulResults: PageResult[] = [];
        const failedPages: Array<{ url: string; error: string }> = [];

        results.forEach((result, index) => {
            if (result.status === "fulfilled") {
                successfulResults.push(result.value);
            } else {
                failedPages.push({
                    url: pages[index],
                    error: result.reason?.message || "Unknown error",
                });
            }
        });

        // Aggregate issues by category
        const allIssues: Record<string, Issue[]> = {
            meta_tags: [],
            links: [],
            headings: [],
            images: [],
            performance: [],
        };

        for (const result of successfulResults) {
            for (const category of Object.keys(allIssues)) {
                if (result.issues[category]) {
                    allIssues[category].push(...result.issues[category]);
                }
            }
        }

        const totalIssues = Object.values(allIssues).reduce(
            (sum, issues) => sum + issues.length,
            0
        );

        return {
            url,
            pages_analyzed: successfulResults.length,
            failed_pages: failedPages,
            total_issues: totalIssues,
            issues_by_category: Object.fromEntries(
                Object.entries(allIssues).map(([k, v]) => [k, v.length])
            ),
            results: successfulResults,
        };
    }
);

/**
 * Discover pages on a website via sitemap or link following.
 */
const crawlPages = task(
    { name: "crawl_pages" },
    async (url: string, maxPages: number): Promise<string[]> => {
        return await discoverPages(url, maxPages);
    }
);

/**
 * Run all 5 SEO checks on a single page.
 */
const analyzePage = task(
    {
        name: "analyze_page",
        retry: {
            maxRetries: 3,
            waitDurationMs: 500,
            backoffScaling: 2.0,
        },
    },
    async (pageUrl: string): Promise<PageResult> => {
        // Fetch the page content
        const pageData = await fetchPage(pageUrl);

        if (pageData.error) {
            return {
                url: pageUrl,
                error: pageData.error,
                issues: {},
            };
        }

        const { html, headers, loadTime, contentLength } = pageData;

        // Run all 5 SEO checks
        const issues: Record<string, Issue[]> = {
            meta_tags: checkMetaTags(html, pageUrl),
            links: await checkLinks(html, pageUrl),
            headings: checkHeadings(html, pageUrl),
            images: checkImages(html, pageUrl),
            performance: checkPerformance(html, pageUrl, loadTime, contentLength, headers),
        };

        return {
            url: pageUrl,
            issues,
            load_time_ms: loadTime,
            content_length: contentLength,
        };
    }
);
