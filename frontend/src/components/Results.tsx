import { useState } from 'react'
import { CATEGORY_LABELS } from '../constants'
import type { AuditResult, PageResult } from '../types'

interface Props {
  data: AuditResult
}

export function Results({ data }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  // Filter pages based on selected category
  const filteredResults = categoryFilter
    ? data.results.filter((page) => {
        const issues = page.issues?.[categoryFilter] || []
        return issues.length > 0
      })
    : data.results

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border border-neutral-700 p-6">
        <div className="mb-6">
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 font-mono text-sm hover:text-white transition-colors"
          >
            {data.url} ↗
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-px bg-neutral-700">
          <div className="bg-black p-4">
            <div className="text-2xl">{data.pages_analyzed}</div>
            <div className="text-neutral-500 text-xs uppercase tracking-wider">
              Pages
            </div>
          </div>
          <div className="bg-black p-4">
            <div className="text-2xl">{data.total_issues}</div>
            <div className="text-neutral-500 text-xs uppercase tracking-wider">
              Issues
            </div>
          </div>
          <div className="bg-black p-4">
            <div className="text-2xl">
              {Object.keys(CATEGORY_LABELS).length}
            </div>
            <div className="text-neutral-500 text-xs uppercase tracking-wider">
              Categories
            </div>
          </div>
        </div>
      </div>

      {/* Categories - clickable filters */}
      <div>
        <div className="text-neutral-500 text-xs uppercase tracking-wider mb-3">
          Filter by Category
          {categoryFilter && (
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className="ml-2 text-(--accent) hover:underline"
            >
              (clear)
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-px bg-neutral-700">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const count = data.issues_by_category[key] || 0
            const isSelected = categoryFilter === key
            return (
              <button
                type="button"
                key={key}
                onClick={() => setCategoryFilter(isSelected ? null : key)}
                className={`bg-black p-4 text-left transition-colors hover:bg-neutral-900 ${
                  count > 0 ? 'border-l-2 border-l-(--warning)' : ''
                } ${isSelected ? 'ring-1 ring-(--accent)' : ''}`}
              >
                <div className="text-xl">{count}</div>
                <div className="text-neutral-500 text-xs uppercase tracking-wider">
                  {label}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Pages */}
      <div>
        <div className="text-neutral-500 text-xs uppercase tracking-wider mb-3">
          By Page{' '}
          {categoryFilter &&
            `(${filteredResults.length} with ${CATEGORY_LABELS[categoryFilter]} issues)`}
        </div>
        <div className="border border-neutral-700 divide-y divide-neutral-700">
          {filteredResults.length === 0 ? (
            <div className="p-4 text-neutral-500 text-sm">
              No pages with issues in this category
            </div>
          ) : (
            filteredResults
              .sort((a, b) => {
                const aCount = categoryFilter
                  ? a.issues?.[categoryFilter]?.length || 0
                  : Object.values(a.issues || {}).flat().length
                const bCount = categoryFilter
                  ? b.issues?.[categoryFilter]?.length || 0
                  : Object.values(b.issues || {}).flat().length
                return bCount - aCount
              })
              .map((page) => (
                <PageRow
                  key={page.url}
                  page={page}
                  categoryFilter={categoryFilter}
                />
              ))
          )}
        </div>
      </div>
    </div>
  )
}

function PageRow({
  page,
  categoryFilter,
}: {
  page: PageResult
  categoryFilter: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const issueCount = categoryFilter
    ? page.issues?.[categoryFilter]?.length || 0
    : Object.values(page.issues || {}).flat().length
  const hasIssues = issueCount > 0 || page.error

  // Extract path from URL
  let path = '/'
  try {
    path = new URL(page.url).pathname || '/'
  } catch {}

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 p-4 flex justify-between items-center hover:bg-neutral-900 transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`text-xs ${hasIssues ? 'text-(--warning)' : 'text-(--success)'}`}
            >
              {hasIssues ? '!' : '✓'}
            </span>
            <span className="font-mono text-sm truncate">{path}</span>
          </div>
          <div className="flex items-center gap-4">
            {page.error ? (
              <span className="text-(--error) text-xs uppercase">Error</span>
            ) : issueCount > 0 ? (
              <span className="text-neutral-400 text-sm">{issueCount}</span>
            ) : (
              <span className="text-neutral-600 text-xs">OK</span>
            )}
            <svg
              className={`w-3 h-3 text-neutral-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-4 text-neutral-600 hover:text-white transition-colors"
          title="Open page in new tab"
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>
      </div>

      {expanded && (
        <div className="border-t border-neutral-800 bg-neutral-950 p-4">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-neutral-500 hover:text-white transition-colors block mb-4"
          >
            {page.url} ↗
          </a>
          {page.error ? (
            <div className="text-(--error) text-sm">{page.error}</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(CATEGORY_LABELS)
                .filter(([key]) => !categoryFilter || key === categoryFilter)
                .map(([category, label]) => {
                  const issues = page.issues?.[category] || []
                  return (
                    <div key={category}>
                      <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">
                        {label}
                      </div>
                      {issues.length === 0 ? (
                        <div className="text-neutral-600 text-xs pl-3 border-l-2 border-l-neutral-800">
                          N/A
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {issues.map((issue, idx) => (
                            <div
                              key={`${category}-${idx}-${issue.message?.slice(0, 20)}`}
                              className="border-l-2 pl-3 py-1 border-l-neutral-700"
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`text-xs px-1 ${
                                    issue.type === 'error'
                                      ? 'bg-(--error) text-white'
                                      : issue.type === 'warning'
                                        ? 'bg-(--warning) text-black'
                                        : 'bg-neutral-700 text-white'
                                  }`}
                                >
                                  {issue.type.toUpperCase()}
                                </span>
                                <span className="text-sm">{issue.message}</span>
                              </div>
                              {issue.element && (
                                <div className="mt-1 text-xs font-mono text-neutral-500 break-all">
                                  {issue.element}
                                </div>
                              )}
                              {issue.selector && (
                                <div className="mt-1 text-xs font-mono text-neutral-600">
                                  {issue.selector}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
