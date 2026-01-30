import { WorkflowVisualizer, type WorkflowConfig } from "workflow-visualizer";

interface WorkflowPageProps {
  onBack: () => void;
}

const seoAuditWorkflow: WorkflowConfig = {
  title: "SEO Audit Workflow",
  subtitle: "How Render Workflows orchestrates distributed SEO analysis",
  nodes: [
    {
      id: "api-trigger",
      label: "API Call",
      type: "trigger",
      description: "User submits a URL via the frontend form, triggering POST /audit",
      position: { x: 300, y: 50 },
      details: [
        { label: "Endpoint", value: "POST /audit" },
        { label: "Input", value: "URL, max_pages, max_concurrency" },
        { label: "Returns", value: "task_run_id for tracking" },
      ],
    },
    {
      id: "audit-site",
      label: "audit_site",
      type: "orchestrator",
      description: "Root task that orchestrates the entire SEO audit workflow",
      position: { x: 300, y: 180 },
      details: [
        { label: "Role", value: "Orchestrator" },
        { label: "Retries", value: "2 (with 1.5x backoff)" },
        { label: "Spawns", value: "crawl_pages, analyze_page" },
      ],
    },
    {
      id: "crawl-pages",
      label: "crawl_pages",
      type: "task",
      description: "Discovers pages to audit by checking sitemap.xml or crawling links",
      position: { x: 150, y: 320 },
      details: [
        { label: "Strategy", value: "Sitemap first, then link crawl" },
        { label: "Rate limit", value: "500ms between requests" },
        { label: "Returns", value: "Array of page URLs" },
      ],
    },
    {
      id: "analyze-page",
      label: "analyze_page",
      type: "batch",
      description: "Analyzes each page for SEO issues. Runs in parallel batches controlled by max_concurrency.",
      position: { x: 450, y: 320 },
      details: [
        { label: "Parallelism", value: "Up to max_concurrency tasks" },
        { label: "Retries", value: "3 (with 2x backoff)" },
        { label: "Analyzers", value: "meta_tags, links, headings, images, performance" },
      ],
    },
  ],
  edges: [
    {
      id: "trigger-to-audit",
      from: "api-trigger",
      to: "audit-site",
      label: "starts",
      style: "solid",
    },
    {
      id: "audit-to-crawl",
      from: "audit-site",
      to: "crawl-pages",
      label: "spawns",
      style: "solid",
    },
    {
      id: "audit-to-analyze",
      from: "audit-site",
      to: "analyze-page",
      label: "spawns batch",
      style: "dashed",
    },
  ],
  defaultTrigger: "api-trigger",
  triggerFlows: [
    {
      triggerId: "api-trigger",
      nodes: ["api-trigger", "audit-site", "crawl-pages", "analyze-page"],
      edges: ["trigger-to-audit", "audit-to-crawl", "audit-to-analyze"],
      animationSequence: [
        {
          id: "step-1",
          activeNodes: ["api-trigger"],
          activeEdges: [],
          duration: 5000,
          title: "1. User Submits URL",
          description: "The frontend sends a POST request to /audit with the target URL and configuration options.",
        },
        {
          id: "step-2",
          activeNodes: ["api-trigger", "audit-site"],
          activeEdges: ["trigger-to-audit"],
          duration: 5000,
          title: "2. Workflow Starts",
          description: "The API triggers the audit_site task, which acts as the orchestrator for the entire workflow.",
        },
        {
          id: "step-3",
          activeNodes: ["audit-site", "crawl-pages"],
          activeEdges: ["audit-to-crawl"],
          duration: 6000,
          title: "3. Page Discovery",
          description: "audit_site spawns crawl_pages to discover all pages to analyze. It first tries sitemap.xml, then falls back to link crawling.",
        },
        {
          id: "step-4",
          activeNodes: ["audit-site", "crawl-pages"],
          activeEdges: ["audit-to-crawl"],
          duration: 5000,
          title: "4. URLs Returned",
          description: "crawl_pages returns a list of discovered page URLs (up to max_pages) back to the orchestrator.",
        },
        {
          id: "step-5",
          activeNodes: ["audit-site", "analyze-page"],
          activeEdges: ["audit-to-analyze"],
          duration: 6000,
          title: "5. Parallel Analysis",
          description: "audit_site spawns analyze_page tasks in batches. Each task runs 5 SEO analyzers: meta tags, links, headings, images, and performance.",
        },
        {
          id: "step-6",
          activeNodes: ["audit-site"],
          activeEdges: [],
          duration: 5000,
          title: "6. Results Aggregated",
          description: "All analyze_page results are collected and aggregated into a final report with issues categorized and counted.",
        },
      ],
    },
  ],
};

export function WorkflowPage({ onBack }: WorkflowPageProps) {
  return (
    <div className="min-h-screen bg-black text-white p-8 relative">
      {/* Back button - absolute positioned within content area */}
      <button
        type="button"
        onClick={onBack}
        className="absolute top-8 right-8 z-50 border border-neutral-700 bg-black px-4 py-3 text-xs text-neutral-400 hover:border-white hover:text-white transition-colors"
      >
        &larr; BACK TO AUDIT
      </button>

      {/* Workflow Visualizer - let it handle its own layout */}
      <WorkflowVisualizer config={seoAuditWorkflow} defaultSelectedNode="api-trigger" />
    </div>
  );
}
