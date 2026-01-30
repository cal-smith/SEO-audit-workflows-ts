from typing import Any, Dict

from render_sdk import Render


async def run_task_sdk(
    render: Render,
    workflow_slug: str,
    validated_url: str,
    max_pages: int,
    max_concurrency: int,
) -> Dict[str, Any]:
    """Run task via the Render SDK (may block until completion)."""
    result = await render.workflows.run_task(
        f"{workflow_slug}/audit_site",
        [validated_url, max_pages, max_concurrency],
    )
    return {
        "id": result.id,
        "status": result.status,
        "results": getattr(result, "results", None),
    }
