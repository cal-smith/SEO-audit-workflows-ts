export type AuditStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'completed'
  | 'error'

export interface Issue {
  type: 'error' | 'warning' | 'info'
  message: string
  element?: string
  selector?: string
}

export interface PageResult {
  url: string
  issues?: Record<string, Issue[]>
  error?: string
}

export interface AuditResult {
  url: string
  pages_analyzed: number
  total_issues: number
  issues_by_category: Record<string, number>
  results: PageResult[]
  failed_pages: PageResult[]
}
