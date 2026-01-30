"""
SEO Auditor API Service

Flask API for triggering and monitoring SEO audits via Render Workflows.
"""

import os
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from parent directory
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from cachetools import TTLCache
import json

# Add parent directory to path for shared module
sys.path.insert(0, str(Path(__file__).parent.parent))
from shared.url_validator import validate_url

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from render_sdk import Render
from render_sdk.client.errors import RenderError, ClientError
import asyncio
import httpx

from config import RENDER_API_BASE_URL
from run_task_sdk import run_task_sdk

app = Flask(__name__)

# CORS configuration - restrict to frontend origin in production
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
cors_origins = (
    [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"]
    if FRONTEND_URL
    else "*"  # Allow all in development
)
CORS(app, origins=cors_origins, methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])
# Security headers (disabled HTTPS enforcement for local dev, enable force_https in production)
Talisman(app, force_https=False, content_security_policy=None)
# Rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["100 per minute"],
    storage_uri="memory://",
)

# Workflow configuration
# WORKFLOW_SLUG: name of your workflow (e.g., "seo-audit-workflow") - used for task identifiers
# WORKFLOW_ID: the wfl-xxx ID of your workflow - used for API filtering
WORKFLOW_SLUG = os.environ.get("WORKFLOW_SLUG", "")
WORKFLOW_ID = os.environ.get("WORKFLOW_ID", "")

# Render SDK client initialization
_render = None


def get_render_client() -> Render:
    """Get Render client for running tasks (local or production)."""
    global _render
    if _render is None:
        use_local_dev = os.environ.get("RENDER_USE_LOCAL_DEV", "").lower() == "true"
        
        if use_local_dev:
            _render = Render(
                token="local-dev",
                base_url="http://localhost:8120",
            )
        else:
            _render = Render()
    return _render


def run_async(coro):
    """Helper to run async code in sync Flask context.
    
    Uses asyncio.run() which is the recommended approach for Python 3.7+.
    This creates a new event loop for each call, which is safe and
    avoids the deprecated get_event_loop() pattern.
    """
    return asyncio.run(coro)


@app.route("/")
def index():
    """API root - health check."""
    return jsonify({"status": "healthy", "service": "seo-audit-api"})


@app.route("/audit", methods=["POST"])
@limiter.limit("10 per minute")
def start_audit():
    """Start a new SEO audit via SDK."""
    data = request.get_json() or {}
    url = data.get("url")
    max_pages = data.get("max_pages", 25)
    max_concurrency = data.get("max_concurrency", 10)
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    # Validate URL for SSRF protection
    url_validation = validate_url(url)
    if not url_validation.valid:
        return jsonify({"error": url_validation.error}), 400
    validated_url = url_validation.normalized_url
    
    if not WORKFLOW_SLUG:
        return jsonify({"error": "WORKFLOW_SLUG not configured"}), 500
    
    try:
        task_run = run_async(
            run_task_sdk(
                get_render_client(),
                WORKFLOW_SLUG,
                validated_url,
                max_pages,
                max_concurrency,
            )
        )
        
        return jsonify({
            "task_run_id": task_run.get("id"),
            "status": task_run.get("status"),
            "results": task_run.get("results"),
        })
    
    except ClientError as e:
        return jsonify({"error": f"Client error: {str(e)}"}), 400
    except RenderError as e:
        return jsonify({"error": f"Render API error: {str(e)}"}), 500


# Cache for task definition ID -> task name mapping (TTL cache to prevent memory leaks)
# Max 1000 entries, 1 hour TTL
_task_name_cache: TTLCache = TTLCache(maxsize=1000, ttl=3600)


async def get_task_name(client: httpx.AsyncClient, task_def_id: str, api_key: str) -> str:
    """Get task name from task definition API, with caching."""
    if task_def_id in _task_name_cache:
        return _task_name_cache[task_def_id]
    
    try:
        response = await client.get(
            f"{RENDER_API_BASE_URL}/tasks/{task_def_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        # Individual task endpoint returns { name, slug, ... } directly (not nested)
        task_name = data.get("name") or task_def_id
        if not data.get("name") and "/" in data.get("slug", ""):
            task_name = data.get("slug", "").split("/")[-1]
        _task_name_cache[task_def_id] = task_name
        logger.info(f"Cached task name: {task_def_id} -> {task_name}")
        return task_name
    except Exception as e:
        logger.warning(f"Could not fetch task definition for {task_def_id}: {e}")
        return task_def_id  # Fallback to ID


async def fetch_spawned_tasks(task_run_id: str) -> list:
    """Fetch tasks spawned by the root task from Render API."""
    api_key = os.environ.get("RENDER_API_KEY")
    if not api_key:
        logger.warning("RENDER_API_KEY not set, cannot fetch spawned tasks")
        return []
    
    try:
        async with httpx.AsyncClient() as client:
            # Use rootTaskRunId filter to get tasks spawned by this root task
            response = await client.get(
                f"{RENDER_API_BASE_URL}/task-runs",
                params={
                    "rootTaskRunId": task_run_id,
                    "limit": 100,
                },
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"Render API returned {len(data)} task runs for root {task_run_id}")
            
            # Collect unique task definition IDs to fetch their names
            unique_task_ids = set(
                st.get("taskId") for st in data 
                if st.get("id") != task_run_id and st.get("taskId")
            )
            
            # Fetch task names for all unique task IDs (usually just 2: crawl_pages, analyze_page)
            for tid in unique_task_ids:
                if tid not in _task_name_cache:
                    await get_task_name(client, tid, api_key)
            
            # Parse spawned tasks (exclude the root task itself)
            related_tasks = []
            for st in data:
                if st.get("id") == task_run_id:
                    continue  # Skip the root task itself
                
                task_def_id = st.get("taskId", "")
                task_name = _task_name_cache.get(task_def_id, task_def_id)
                inputs = st.get("input", [])
                    
                related_tasks.append({
                    "id": st.get("id"),
                    "status": st.get("status"),
                    "task_id": task_name,
                    "startedAt": st.get("startedAt"),
                    "completedAt": st.get("completedAt"),  # API returns completedAt
                    "input": inputs[0] if inputs else None,
                })
            
            logger.info(f"Found {len(related_tasks)} spawned tasks for {task_run_id}")
            return related_tasks
            
    except httpx.HTTPStatusError as e:
        logger.warning(f"HTTP error fetching spawned tasks: {e.response.status_code} - {e.response.text}")
        return []
    except Exception as e:
        logger.warning(f"Could not fetch spawned tasks from API: {e}")
        return []


async def fetch_task_status(client, task_run_id: str):
    """Fetch task run status and spawned tasks."""
    task_run = await client.workflows.get_task_run(task_run_id)
    
    response = {
        "id": task_run.id,
        "status": task_run.status,
        "retries": task_run.retries,
    }
    
    # Get tasks spawned by the root task
    response["tasks"] = await fetch_spawned_tasks(task_run_id)
    
    if task_run.status == "completed":
        response["results"] = task_run.results
    
    return response


@app.route("/audit/<task_run_id>", methods=["GET"])
def get_audit_status(task_run_id: str):
    """Get the status and results of an audit."""
    try:
        client = get_render_client()
        response = run_async(fetch_task_status(client, task_run_id))
        return jsonify(response)
    
    except ClientError as e:
        return jsonify({"error": f"Task run not found: {str(e)}"}), 404
    except RenderError as e:
        return jsonify({"error": f"Render API error: {str(e)}"}), 500


@app.route("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy"})


@app.route("/status")
def status():
    """Check workflow configuration and task availability."""
    result = {
        "api": "ok",
        "workflow_configured": bool(WORKFLOW_SLUG and WORKFLOW_ID),
        "workflow_slug": WORKFLOW_SLUG or None,
        "workflow_id": WORKFLOW_ID or None,
        "tasks": None,
        "message": None,
    }
    
    if not WORKFLOW_SLUG:
        result["message"] = "WORKFLOW_SLUG not configured. Set it in your environment variables."
        return jsonify(result)
    
    if not WORKFLOW_ID:
        result["message"] = "WORKFLOW_ID not configured. Set it in your environment variables (e.g., wfl-xxxxx)."
        return jsonify(result)
    
    if not os.environ.get("RENDER_API_KEY"):
        result["message"] = "RENDER_API_KEY not configured. Set it in your environment variables."
        return jsonify(result)
    
    # Try to fetch task definitions from the workflow
    # Per API docs: https://api-docs.render.com/reference/listtasks
    try:
        api_key = os.environ.get("RENDER_API_KEY")
        with httpx.Client(timeout=10) as client:
            # Filter tasks by workflowId parameter
            response = client.get(
                f"{RENDER_API_BASE_URL}/tasks",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"workflowId": WORKFLOW_ID, "limit": 100},
            )
            response.raise_for_status()
            # Response is array of { task: { id, name, ... }, cursor }
            items = response.json()
            logger.info(f"Found {len(items)} tasks for workflow {WORKFLOW_ID}")
            
            if items:
                # Extract unique task names (dedupe in case multiple services register same tasks)
                task_names = [item.get("task", {}).get("name") for item in items]
                unique_names = list(dict.fromkeys(n for n in task_names if n))  # Preserves order, removes None
                known_tasks = {"audit_site", "crawl_pages", "analyze_page"}
                filtered = [name for name in unique_names if name in known_tasks]
                result["tasks"] = filtered or unique_names
                result["message"] = f"Found {len(result['tasks'])} tasks"
            else:
                result["message"] = f"No tasks found for workflow '{WORKFLOW_ID}'. Deploy the workflow service first."
    except Exception as e:
        logger.warning(f"Could not fetch tasks: {e}")
        result["message"] = f"Could not verify tasks: {str(e)}"
    
    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
