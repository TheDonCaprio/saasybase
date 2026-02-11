import { useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export function useListFilterState(
  initialSearch: string = '',
  initialStatus: string = 'ALL',
  delay = 500
) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [datePreset, setDatePreset] = useState<'ALL'|'TODAY'|'YESTERDAY'|'LAST_7'|'LAST_MONTH'|'THIS_MONTH'|'THIS_QUARTER'|'THIS_YEAR'|'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, delay);

  const reset = () => {
    setSearch('');
    setStatus('ALL');
    setDatePreset('ALL');
    setStartDate(null);
    setEndDate(null);
  };

  return {
    search,
    setSearch,
    debouncedSearch,
    status,
    setStatus,
    datePreset,
    setDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    reset
  } as const;
}

export default useListFilterState;
