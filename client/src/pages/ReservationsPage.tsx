import { useState } from 'react';
import { describeError, patch } from '../api/client';
import { statusColor } from '../api/labels';
import { fullName, hhmm, reservations, schedules } from '../api/resources';
import type { Reservation, ReservationStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataTable, Pagination, type Column } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { SearchBox } from '../components/SearchBox';
import { useToast } from '../components/Toast';
import { toStr } from '../hooks/useForm';
import { useInvalidate, useList } from '../hooks/useList';
import { useListParams } from '../hooks/useListParams';
import { BookClassModal } from './SchedulePage';

const STATUSES: ReservationStatus[] = ['Booked', 'Attended', 'Cancelled'];

export function ReservationsPage() {
  const { can } = useAuth();
  const { params, set, toggleSort } = useListParams();
  const { data, isFetching, errorMessage } = useList(reservations, params);
  const invalidate = useInvalidate();
  const toast = useToast();
  const [booking, setBooking] = useState(false);

  const counts = data?.meta.statusCounts ?? {};
  const allCount = STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  const setStatus = async (r: Reservation, ReservationStatus: 'Attended' | 'Cancelled') => {
    try {
      await patch(`${reservations.path}/${r.ReservationID}`, { ReservationStatus });
      toast(`${fullName(r.MemberFirstName, r.MemberLastName)}: ${ReservationStatus.toLowerCase()}`);
      invalidate(reservations.path, schedules.path, '/dashboard');
    } catch (err) {
      toast(describeError(err), 'error');
    }
  };

  const columns: Column<Reservation>[] = [
    { header: 'ID', sort: 'id', cell: (r) => <span className="badge badge-gray">{r.ReservationID}</span> },
    { header: 'Member', sort: 'member', cell: (r) => <strong>{fullName(r.MemberFirstName, r.MemberLastName)}</strong> },
    { header: 'Class', cell: (r) => r.ClassName },
    {
      header: 'Class time',
      sort: 'classStart',
      cell: (r) => (
        <span className="nowrap">
          {r.StartDate} {hhmm(r.StartTime)}
        </span>
      ),
    },
    { header: 'Booked on', sort: 'date', cell: (r) => r.ReservationDate },
    {
      header: 'Status',
      sort: 'status',
      cell: (r) => <span className={`badge ${statusColor[r.ReservationStatus]}`}>{r.ReservationStatus}</span>,
    },
  ];
  if (can('reservations:update')) {
    columns.push({
      header: 'Actions',
      className: 'actions',
      cell: (r) =>
        r.ReservationStatus === 'Booked' ? (
          <>
            <button
              type="button"
              className="button button-small"
              onClick={() => setStatus(r, 'Attended')}
              aria-label={`Mark ${r.MemberFirstName} attended`}
            >
              Attended
            </button>
            <button
              type="button"
              className="button button-small button-danger"
              onClick={() => setStatus(r, 'Cancelled')}
              aria-label={`Cancel ${r.MemberFirstName}'s reservation`}
            >
              Cancel
            </button>
          </>
        ) : null,
    });
  }

  return (
    <div>
      <PageHeader title="Reservations" count={data?.meta.total}>
        {can('reservations:create') && (
          <button type="button" className="button button-primary" onClick={() => setBooking(true)}>
            Book a class
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <SearchBox label="Search member or class" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <div className="chips" role="group" aria-label="Filter by status">
          <button type="button" className="chip" aria-pressed={!params.status} onClick={() => set({ status: '' })}>
            All ({allCount})
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={params.status === s}
              onClick={() => set({ status: s })}
            >
              {s} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
      </div>

      <DataTable
        caption="Reservations"
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.ReservationID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort ?? 'id'), order: toStr(params.order ?? 'desc'), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {booking && <BookClassModal onClose={() => setBooking(false)} />}
    </div>
  );
}
