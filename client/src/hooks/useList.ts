import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError, type Params } from '../api/client';
import type { Paginated } from '../api/types';

interface Listable<T> {
  path: string;
  list: (params?: Params) => Promise<Paginated<T>>;
}

/** Fetches one page of a list; keeps the previous page on screen while the next loads. */
export function useList<T>(resource: Listable<T>, params: Params) {
  const query = useQuery({
    queryKey: [resource.path, params],
    queryFn: () => resource.list(params),
    placeholderData: keepPreviousData,
  });
  return { ...query, errorMessage: query.error ? describeError(query.error) : null };
}

/** Returns a function that refetches every list/detail under the given API paths. */
export function useInvalidate() {
  const client = useQueryClient();
  return (...paths: string[]) => Promise.all(paths.map((p) => client.invalidateQueries({ queryKey: [p] })));
}
