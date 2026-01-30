/**
 * SEO Auditor API Service
 *
 * Express API for triggering and monitoring SEO audits via Render Workflows.
 * Uses the official @renderinc/sdk for workflow operations.
 */

import { Render } from "@renderinc/sdk";
import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { LRUCache } from "lru-cache";
import { AuditRequestSchema, validateRequest } from "../shared/schemas.js";
import { validateUrl } from "../shared/urlValidator.js";
import {
  RENDER_API_BASE_URL,
  RENDER_API_KEY,
  WORKFLOW_ID,
  WORKFLOW_SLUG,
} from "./config.js";
import { runTaskSdk } from "./runTaskSdk.js";

const app = express();
// Security headers - configured for API use (allow cross-origin requests)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Not needed for JSON API
  })
);

// CORS configuration - restrict to frontend origin in production
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const corsOptions: cors.CorsOptions = {
  origin: FRONTEND_URL
    ? [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"] // Allow frontend + dev servers
    : true, // Allow all in development
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting for audit endpoint
const auditRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: { error: "Too many audit requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limiting
const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalRateLimiter);



// Create Render SDK instance
// Uses RENDER_API_KEY from environment by default, but we can also pass it explicitly
function getRenderClient(): Render {
  const baseUrl = process.env.RENDER_USE_LOCAL_DEV?.toLowerCase() === "true"
    ? "http://localhost:8120"
    : undefined; // SDK uses https://api.render.com by default

  return new Render({
    token: RENDER_API_KEY || undefined,
    baseUrl,
  });
}

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "healthy", service: "seo-audit-api" });
});

// Start a new audit via SDK
app.post("/audit", auditRateLimiter, async (req, res) => {
  // Validate request body with Zod schema
  const validation = validateRequest(AuditRequestSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const {
    url,
    max_pages: maxPages,
    max_concurrency: maxConcurrency,
  } = validation.data;

  // Validate URL for SSRF protection
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid || !urlValidation.normalizedUrl) {
    return res.status(400).json({ error: urlValidation.error ?? "Invalid URL" });
  }
  const validatedUrl = urlValidation.normalizedUrl;

  if (!WORKFLOW_SLUG) {
    return res.status(500).json({ error: "WORKFLOW_SLUG not configured" });
  }

  if (!RENDER_API_KEY) {
    return res.status(500).json({ error: "RENDER_API_KEY not configured" });
  }

  try {
    const input = [validatedUrl, maxPages, maxConcurrency];
    const taskRun = await runTaskSdk({
      render: getRenderClient(),
      workflowSlug: WORKFLOW_SLUG,
      input,
    });

    console.log(`Started audit task: ${taskRun.id}`);

    res.json({
      task_run_id: taskRun.id,
      status: taskRun.status,
      results: taskRun.results,
    });
  } catch (error) {
    console.error("Error starting audit:", error);
    const message = error instanceof Error ? error.message : "Failed to start audit";
    res.status(500).json({ error: message });
  }
});

// Cache for task definition ID -> task name mapping (LRU with TTL to prevent memory leaks)
const taskNameCache = new LRUCache<string, string>({
  max: 1000, // Maximum 1000 entries
  ttl: 1000 * 60 * 60, // 1 hour TTL
});

// Get task name from task definition API, with caching
async function getTaskName(taskDefId: string): Promise<string> {
  const cached = taskNameCache.get(taskDefId);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(
      `${RENDER_API_BASE_URL}/tasks/${taskDefId}`,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    if (!response.ok) {
      console.warn(`Could not fetch task definition for ${taskDefId}`);
      return taskDefId;
    }

    const data = await response.json() as { name?: string; slug?: string };
    // Individual task endpoint returns { name, slug, ... } directly (not nested)
    const slugPart = data.slug?.includes("/") ? data.slug.split("/").pop() : undefined;
    const taskName = data.name || slugPart || taskDefId;
    taskNameCache.set(taskDefId, taskName);
    console.log(`Cached task name: ${taskDefId} -> ${taskName}`);
    return taskName;
  } catch (error) {
    console.warn(`Could not fetch task definition for ${taskDefId}:`, error);
    return taskDefId;
  }
}

interface SpawnedTask {
  id: string;
  status: string;
  task_id: string;
  input: string | null;
  startedAt?: string;
  completedAt?: string;
}

// Fetch tasks spawned by the root task using direct API (SDK doesn't return input)
async function fetchSpawnedTasks(taskRunId: string): Promise<SpawnedTask[]> {
  if (!RENDER_API_KEY) {
    console.warn("RENDER_API_KEY not set, cannot fetch spawned tasks");
    return [];
  }

  try {
    // Use direct API call to get full task data including input
    const response = await fetch(
      `${RENDER_API_BASE_URL}/task-runs?rootTaskRunId=${taskRunId}&limit=100`,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch task runs: ${response.status}`);
      return [];
    }

    const taskRuns = await response.json() as Array<{
      id: string;
      taskId?: string;
      status: string;
      input?: unknown[];
      startedAt?: string;
      completedAt?: string;  // API returns completedAt, not finishedAt
    }>;

    console.log(`API returned ${taskRuns.length} task runs for root ${taskRunId}`);

    // Collect unique task definition IDs to fetch their names
    const uniqueTaskIds = new Set<string>(
      taskRuns
        .filter((st) => st.id !== taskRunId && st.taskId)
        .map((st) => st.taskId as string)
    );

    // Fetch task names for all unique task IDs (usually just 2: crawl_pages, analyze_page)
    for (const tid of uniqueTaskIds) {
      if (!taskNameCache.has(tid)) {
        await getTaskName(tid);
      }
    }

    // Filter out root task
    const filteredTasks = taskRuns.filter((st) => st.id !== taskRunId);

    // Parse spawned tasks (exclude the root task itself)
    // Note: list API doesn't return input field, so URLs won't show
    const relatedTasks: SpawnedTask[] = filteredTasks
      .map((st) => {
        const taskDefId = st.taskId || "";
        const taskName = taskNameCache.get(taskDefId) || taskDefId;
        const inputs = st.input || [];

        return {
          id: st.id,
          status: st.status,
          task_id: taskName,
          input: (inputs[0] as string) || null,
          startedAt: st.startedAt,
          completedAt: st.completedAt,  // Use completedAt directly
        };
      });

    console.log(`Found ${relatedTasks.length} spawned tasks for ${taskRunId}`);
    return relatedTasks;
  } catch (error) {
    console.warn("Could not fetch spawned tasks:", error);
    return [];
  }
}

// Get audit status
app.get("/audit/:taskRunId", async (req, res) => {
  const { taskRunId } = req.params;

  try {
    const render = getRenderClient();
    const taskRun = await render.workflows.getTaskRun(taskRunId);

    const responseData: {
      id: string;
      status: string;
      retries?: number;
      tasks: SpawnedTask[];
      results?: unknown;
    } = {
      id: taskRun.id,
      status: taskRun.status,
      retries: taskRun.retries,
      tasks: await fetchSpawnedTasks(taskRunId),
    };

    if (taskRun.status === "completed") {
      responseData.results = taskRun.results;
    }

    res.json(responseData);
  } catch (error) {
    console.error("Error getting audit status:", error);
    const message = error instanceof Error ? error.message : "Failed to get status";
    if (message.includes("404") || message.includes("not found")) {
      res.status(404).json({ error: "Task run not found" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

// Status endpoint - check workflow configuration
app.get("/status", async (_req, res) => {
  const result: {
    api: string;
    workflow_configured: boolean;
    workflow_slug: string | null;
    workflow_id: string | null;
    tasks: string[];
    message: string | null;
  } = {
    api: "ok",
    workflow_configured: Boolean(WORKFLOW_SLUG && WORKFLOW_ID && RENDER_API_KEY),
    workflow_slug: WORKFLOW_SLUG || null,
    workflow_id: WORKFLOW_ID || null,
    tasks: [],
    message: null,
  };

  if (!WORKFLOW_SLUG) {
    result.message = "WORKFLOW_SLUG not configured. Set it in your environment variables.";
    return res.json(result);
  }

  if (!WORKFLOW_ID) {
    result.message = "WORKFLOW_ID not configured. Set it in your environment variables (e.g., wfl-xxxxx).";
    return res.json(result);
  }

  if (!RENDER_API_KEY) {
    result.message = "RENDER_API_KEY not configured. Set it in your environment variables.";
    return res.json(result);
  }

  try {
    // List tasks filtered by workflowId (per API docs: https://api-docs.render.com/reference/listtasks)
    const response = await fetch(
      `${RENDER_API_BASE_URL}/tasks?workflowId=${WORKFLOW_ID}&limit=100`,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Tasks API error: ${response.status} - ${errorText}`);
      result.message = `Could not verify tasks: HTTP ${response.status}`;
      return res.json(result);
    }

    // Response is array of { task: { id, name, ... }, cursor }
    const items = await response.json() as Array<{ task: { name?: string; id?: string } }>;
    console.log(`Found ${items.length} tasks for workflow ${WORKFLOW_ID}`);

    if (items.length > 0) {
      // Extract unique task names from nested structure (dedupe in case multiple services register same tasks)
      const taskNames = items.map((t) => t.task?.name).filter((n): n is string => Boolean(n));
      const uniqueNames = [...new Set(taskNames)];
      const knownTasks = ["audit_site", "crawl_pages", "analyze_page"];
      const filtered = uniqueNames.filter((name) => knownTasks.includes(name));

      result.tasks = filtered.length > 0 ? filtered : uniqueNames;
      result.message = `Found ${result.tasks.length} tasks`;
    } else {
      result.message = `No tasks found for workflow '${WORKFLOW_ID}'. Deploy the workflow service first.`;
    }
  } catch (error) {
    console.warn("Could not fetch tasks:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    result.message = `Could not verify tasks: ${message}`;
  }

  res.json(result);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`SEO Audit API listening on port ${PORT}`);
});
