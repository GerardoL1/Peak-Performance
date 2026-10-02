import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
import type { Lookups } from '../api/types';

/** Plans, roles, classes, rooms and staff for dropdowns (cached for the session). */
export function useLookups() {
  return useQuery({ queryKey: ['lookups'], queryFn: () => get<Lookups>('/lookups'), staleTime: 5 * 60_000 });
}
