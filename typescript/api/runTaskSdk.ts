import type { Render } from "@renderinc/sdk"

export interface StartTaskResult {
  id: string
  status: string
  results?: unknown
}

interface StartTaskSdkParams {
  render: Render
  workflowSlug: string
  input: unknown[]
}

export async function runTaskSdk({
  render,
  workflowSlug,
  input,
}: StartTaskSdkParams): Promise<StartTaskResult> {
  const result = await render.workflows.runTask(`${workflowSlug}/audit_site`, input)
  return {
    id: result.id,
    status: result.status,
    results: result.results,
  }
}
