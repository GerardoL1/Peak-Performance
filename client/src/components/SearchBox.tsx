import { useEffect, useState } from 'react';
import { useDebounced } from '../hooks/useListParams';

/** Search input that reports its value 300 ms after the user stops typing. */
export function SearchBox({ value, onSearch, label }: { value: string; onSearch: (q: string) => void; label: string }) {
  const [text, setText] = useState(value);
  const debounced = useDebounced(text);

  useEffect(() => {
    if (debounced !== value) onSearch(debounced);
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="search"
      className="search"
      placeholder={`${label}…`}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
