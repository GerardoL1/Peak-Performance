import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Params } from '../api/client';

/**
 * Keeps page / sort / order / search / filters in the URL, so a filtered list
 * survives a refresh and can be shared as a link.
 */
export function useListParams(defaults: Params = {}) {
  const [search, setSearch] = useSearchParams();

  const params: Params = { pageSize: 20, ...defaults };
  search.forEach((value, key) => {
    params[key] = value;
  });

  const set = useCallback(
    (changes: Params, { resetPage = true } = {}) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearch]
  );

  const toggleSort = (key: string) => {
    const same = params.sort === key;
    set({ sort: key, order: same && params.order !== 'desc' ? 'desc' : 'asc' }, { resetPage: false });
  };

  return { params, set, toggleSort };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
