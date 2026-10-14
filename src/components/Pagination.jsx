import { useEffect, useState } from 'react'

export const PAGE_SIZE = 50

/** Faqosje në shfletues për lista të ngarkuara tashmë. */
export function usePaged(list, resetKey) {
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [resetKey])
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safe = Math.min(page, pages - 1)
  return {
    rows: list.slice(safe * PAGE_SIZE, (safe + 1) * PAGE_SIZE),
    page: safe,
    pages,
    setPage,
    total: list.length,
  }
}

export default function Pagination({ paged }) {
  if (paged.pages <= 1) return <div className="pager muted small">{paged.total} rreshta</div>
  return (
    <div className="pager">
      <button className="btn small" disabled={paged.page === 0} onClick={() => paged.setPage(paged.page - 1)}>
        ‹ Para
      </button>
      <span className="muted small">
        Faqja {paged.page + 1} nga {paged.pages} · {paged.total} rreshta
      </span>
      <button className="btn small" disabled={paged.page >= paged.pages - 1} onClick={() => paged.setPage(paged.page + 1)}>
        Pas ›
      </button>
    </div>
  )
}
