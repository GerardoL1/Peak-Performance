import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { members } from '../api/resources';
import { useDebounced } from '../hooks/useListParams';

interface MemberSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Label for the current value, so an edit form shows it before any search. */
  currentLabel?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  required?: boolean;
}

/**
 * Members can number in the thousands, so instead of one huge dropdown this is a
 * search box that narrows a short dropdown of matches (from the API).
 */
export function MemberSelect({ id, value, onChange, currentLabel, ...aria }: MemberSelectProps) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const { data, isFetching } = useQuery({
    queryKey: [members.path, 'picker', debounced],
    queryFn: () => members.list({ q: debounced, pageSize: 25, sort: 'name' }),
  });

  const options = data?.data ?? [];
  const showCurrent = value && currentLabel && !options.some((m) => String(m.MemberID) === value);

  return (
    <div className="member-select">
      <input
        type="search"
        placeholder="Search by name, email or phone"
        aria-label="Search members"
        aria-controls={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...aria}>
        <option value="">{isFetching ? 'Searching…' : `Select a member (${data?.meta.total ?? 0} found)`}</option>
        {showCurrent && <option value={value}>{currentLabel}</option>}
        {options.map((m) => (
          <option key={m.MemberID} value={m.MemberID}>
            {m.FirstName} {m.LastName} · {m.Email}
          </option>
        ))}
      </select>
    </div>
  );
}
