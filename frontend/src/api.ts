/**
 * API utilities for communicating with the backend.
 *
 * Set VITE_API_URL environment variable to point to the backend service.
 * Defaults to relative paths for local development with proxy.
 */

const RAW_API_URL = import.meta.env.VITE_API_URL || ''
const NORMALIZED_HOST = RAW_API_URL && !RAW_API_URL.includes('.')
  ? `${RAW_API_URL}.onrender.com`
  : RAW_API_URL
export const API_URL =
  NORMALIZED_HOST && !/^https?:\/\//i.test(NORMALIZED_HOST)
    ? `https://${NORMALIZED_HOST}`
    : NORMALIZED_HOST

interface StartAuditResponse {
  task_run_id: string
  status: string
  results?: unknown
}

export async function startAudit(
  url: string,
  maxPages: number,
  maxConcurrency: number = 10,
): Promise<StartAuditResponse> {
  const response = await fetch(`${API_URL}/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      max_pages: maxPages,
      max_concurrency: maxConcurrency,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to start audit')
  }

  return data as StartAuditResponse
}

export async function getAuditStatus(taskRunId: string) {
  const response = await fetch(`${API_URL}/audit/${taskRunId}`)

  if (!response.ok) {
    throw new Error('Failed to fetch status')
  }

  return response.json()
}

export async function checkStatus() {
  const response = await fetch(`${API_URL}/status`)

  if (!response.ok) {
    throw new Error('API not reachable')
  }

  return response.json()
}
