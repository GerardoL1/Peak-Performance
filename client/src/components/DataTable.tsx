import type { ReactNode } from 'react';
import type { Paginated } from '../api/types';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Public sort key understood by the API (omit for unsortable columns). */
  sort?: string;
  className?: string;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => number | string;
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  sort?: { key?: string; order?: string; onSort: (key: string) => void };
}

/**
 * Scrolls horizontally on small screens instead of clipping. Sortable headers are
 * real buttons with aria-sort, so they work with the keyboard and screen readers.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, loading, error, empty, sort }: Props<T>) {
  const ariaSort = (key?: string) => {
    if (!key || sort?.key !== key) return undefined;
    return sort.order === 'desc' ? 'descending' : 'ascending';
  };

  return (
    <div className="table-container" aria-busy={loading}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" aria-sort={ariaSort(c.sort)} className={c.className}>
                {c.sort && sort ? (
                  <button type="button" className="sort-button" onClick={() => sort.onSort(c.sort!)}>
                    {c.header}
                    <span aria-hidden="true">{sort.key === c.sort ? (sort.order === 'desc' ? ' ▼' : ' ▲') : ' ↕'}</span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td colSpan={columns.length} className="table-message error">
                {error}
              </td>
            </tr>
          ) : loading && !rows ? (
            <tr>
              <td colSpan={columns.length} className="table-message">
                Loading…
              </td>
            </tr>
          ) : !rows?.length ? (
            <tr>
              <td colSpan={columns.length} className="table-message">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.header} className={c.className}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta?: Paginated<unknown>['meta']; onPage: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>
        {first}–{last} of {meta.total}
      </span>
      <button type="button" className="button" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Previous
      </button>
      <span aria-current="page">
        Page {meta.page} of {meta.totalPages}
      </span>
      <button
        type="button"
        className="button"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPage(meta.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
