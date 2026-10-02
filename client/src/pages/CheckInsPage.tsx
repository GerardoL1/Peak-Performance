import { useState, type FormEvent } from 'react';
import { describeError, post } from '../api/client';
import { checkins } from '../api/resources';
import type { CheckIn } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataTable, Pagination, type Column } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { MemberSelect } from '../components/Pickers';
import { SearchBox } from '../components/SearchBox';
import { useToast } from '../components/Toast';
import { toStr } from '../hooks/useForm';
import { useInvalidate, useList } from '../hooks/useList';
import { useListParams } from '../hooks/useListParams';

export function CheckInsPage() {
  const { can } = useAuth();
  const { params, set, toggleSort } = useListParams();
  const { data, isFetching, errorMessage } = useList(checkins, params);

  const columns: Column<CheckIn>[] = [
    { header: 'Time', sort: 'time', cell: (c) => <span className="nowrap mono">{c.CheckInTime}</span> },
    {
      header: 'Member',
      sort: 'member',
      cell: (c) => (
        <strong>
          {c.FirstName} {c.LastName}
        </strong>
      ),
    },
    { header: 'Member ID', cell: (c) => <span className="badge badge-gray">{c.MemberID}</span> },
    { header: 'Plan', cell: (c) => c.PlanName },
  ];

  return (
    <div>
      <PageHeader title="Check-ins" count={data?.meta.total} />
      {can('checkins:create') && <CheckInForm />}

      <div className="toolbar">
        <SearchBox label="Search member" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          From <input type="date" value={toStr(params.from)} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="inline-field">
          To <input type="date" value={toStr(params.to)} onChange={(e) => set({ to: e.target.value })} />
        </label>
      </div>
      <DataTable
        caption="Check-ins"
        columns={columns}
        rows={data?.data}
        rowKey={(c) => c.CheckInID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort ?? 'time'), order: toStr(params.order ?? 'desc'), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />
    </div>
  );
}

function CheckInForm() {
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const invalidate = useInvalidate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!memberId) return;
    setBusy(true);
    try {
      const c = await post<CheckIn>(checkins.path, { MemberID: memberId });
      toast(`${c.FirstName} ${c.LastName} checked in at ${c.CheckInTime.slice(11, 16)}`);
      setMemberId('');
      invalidate(checkins.path, '/dashboard');
    } catch (err) {
      toast(describeError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card checkin-form" onSubmit={submit}>
      <h2 className="section-title">Check a member in</h2>
      <div className="checkin-row">
        <MemberSelect id="checkin-member" value={memberId} onChange={setMemberId} required />
        <button type="submit" className="button button-primary" disabled={!memberId || busy}>
          {busy ? 'Checking in…' : 'Check in'}
        </button>
      </div>
    </form>
  );
}
