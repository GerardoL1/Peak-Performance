import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { fullName, hhmm, reservations, schedules } from '../api/resources';
import type { Schedule } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { difficultyColor } from '../api/labels';
import { DataTable, Pagination, type Column } from '../components/DataTable';
import { Field, FormActions } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { ConfirmDialog, Modal } from '../components/Modal';
import { MemberSelect } from '../components/Pickers';
import { SearchBox } from '../components/SearchBox';
import { useToast } from '../components/Toast';
import { toStr, useForm } from '../hooks/useForm';
import { useLookups } from '../hooks/useLookups';
import { useInvalidate, useList } from '../hooks/useList';
import { useListParams } from '../hooks/useListParams';

export function SchedulePage() {
  const { can } = useAuth();
  const { params, set, toggleSort } = useListParams({ sort: 'start', upcoming: 'true' });
  const { data, isFetching, errorMessage } = useList(schedules, params);
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const [booking, setBooking] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    if (!deleting) return;
    try {
      await schedules.remove(deleting.ScheduleID);
      toast('Class removed from the schedule');
      setDeleting(null);
      invalidate(schedules.path, '/dashboard');
    } catch (err) {
      setDeleteError(describeError(err));
    }
  };

  const columns: Column<Schedule>[] = [
    { header: 'Date', sort: 'start', cell: (s) => <span className="nowrap">{s.StartDate}</span> },
    {
      header: 'Time',
      cell: (s) => (
        <span className="nowrap">
          {hhmm(s.StartTime)}–{hhmm(s.EndTime)}
        </span>
      ),
    },
    {
      header: 'Class',
      sort: 'class',
      cell: (s) => (
        <>
          <strong>{s.ClassName}</strong>{' '}
          <span className={`badge ${difficultyColor[s.DifficultyLevel]}`}>{s.DifficultyLevel}</span>
        </>
      ),
    },
    { header: 'Instructor', cell: (s) => fullName(s.StaffFirstName, s.StaffLastName) },
    { header: 'Room', sort: 'room', cell: (s) => <span className="badge badge-blue">Room {s.RoomNumber}</span> },
    {
      header: 'Booked',
      cell: (s) => (
        <span className={s.Booked >= s.MaxCapacity ? 'badge badge-red' : 'nowrap'}>
          {s.Booked} / {s.MaxCapacity}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'actions',
      cell: (s) => (
        <>
          {can('reservations:create') && (
            <button
              type="button"
              className="button button-small button-primary"
              disabled={s.Booked >= s.MaxCapacity}
              onClick={() => setBooking(s)}
              aria-label={`Book ${s.ClassName} on ${s.StartDate}`}
            >
              Book
            </button>
          )}
          {can('schedules:write') && (
            <>
              <button
                type="button"
                className="button button-small"
                onClick={() => setEditing(s)}
                aria-label={`Edit ${s.ClassName} on ${s.StartDate}`}
              >
                Edit
              </button>
              <button
                type="button"
                className="button button-small button-danger"
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(s);
                }}
                aria-label={`Remove ${s.ClassName} on ${s.StartDate}`}
              >
                Remove
              </button>
            </>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Class schedule" count={data?.meta.total}>
        {can('schedules:write') && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            Schedule a class
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <SearchBox label="Search schedule" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          Class
          <select value={toStr(params.classId)} onChange={(e) => set({ classId: e.target.value })}>
            <option value="">All classes</option>
            {lookups?.classes.map((c) => (
              <option key={c.ClassID} value={c.ClassID}>
                {c.ClassName}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <input
            type="checkbox"
            checked={params.upcoming === 'true'}
            onChange={(e) => set({ upcoming: e.target.checked ? 'true' : 'false' })}
          />
          Upcoming only
        </label>
      </div>

      <DataTable
        caption="Class schedule"
        columns={columns}
        rows={data?.data}
        rowKey={(s) => s.ScheduleID}
        loading={isFetching}
        error={errorMessage}
        empty={
          params.upcoming === 'true'
            ? 'No upcoming classes. Untick "Upcoming only" to see past ones.'
            : 'No classes scheduled.'
        }
        sort={{ key: toStr(params.sort), order: toStr(params.order), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {editing && <ScheduleForm schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {booking && <BookClassModal schedule={booking} onClose={() => setBooking(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Remove class from schedule"
          message={
            <p>
              Remove <strong>{deleting.ClassName}</strong> on {deleting.StartDate}? Classes with reservations can't be
              removed.
            </p>
          }
          confirmLabel="Remove"
          error={deleteError}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function ScheduleForm({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const { bind, values, setValues, errors, formError, busy, submit } = useForm({
    ClassID: toStr(schedule?.ClassID),
    StaffID: toStr(schedule?.StaffID),
    RoomID: toStr(schedule?.RoomID),
    MaxCapacity: toStr(schedule?.MaxCapacity ?? 20),
    StartDate: schedule?.StartDate ?? '',
    StartTime: hhmm(schedule?.StartTime),
    EndTime: hhmm(schedule?.EndTime),
  });
  const instructors =
    lookups?.staff.filter((s) => s.RoleName === 'Group Fitness Instructor' || s.StaffID === schedule?.StaffID) ?? [];

  // Picking a class fills in the end time from its duration.
  const onClassChange = (classId: string) => {
    const cls = lookups?.classes.find((c) => String(c.ClassID) === classId);
    setValues((v) => {
      if (!cls || !v.StartTime) return { ...v, ClassID: classId };
      const [h, m] = v.StartTime.split(':').map(Number);
      const end = h * 60 + m + cls.Duration;
      const EndTime =
        end < 24 * 60
          ? `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
          : v.EndTime;
      return { ...v, ClassID: classId, EndTime };
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...values, EndDate: values.StartDate };
    submit(
      () => (schedule ? schedules.update(schedule.ScheduleID, body) : schedules.create(body)),
      schedule ? 'Schedule updated' : 'Class scheduled',
      () => {
        invalidate(schedules.path, '/dashboard');
        onClose();
      }
    );
  };

  return (
    <Modal title={schedule ? 'Edit scheduled class' : 'Schedule a class'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          <Field label="Class" required error={errors.ClassID}>
            {(p) => (
              <select {...p} value={values.ClassID} onChange={(e) => onClassChange(e.target.value)}>
                <option value="">Select a class</option>
                {lookups?.classes.map((c) => (
                  <option key={c.ClassID} value={c.ClassID}>
                    {c.ClassName} ({c.Duration} min)
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Instructor" required error={errors.StaffID}>
            {(p) => (
              <select {...p} {...bind('StaffID')}>
                <option value="">Select an instructor</option>
                {instructors.map((s) => (
                  <option key={s.StaffID} value={s.StaffID}>
                    {s.FirstName} {s.LastName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Room" required error={errors.RoomID}>
            {(p) => (
              <select {...p} {...bind('RoomID')}>
                <option value="">Select a room</option>
                {lookups?.rooms.map((r) => (
                  <option key={r.RoomID} value={r.RoomID}>
                    Room {r.RoomNumber} · {r.FacilityName} (max {r.Capacity})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Max capacity" required error={errors.MaxCapacity}>
            {(p) => <input {...p} type="number" min={1} {...bind('MaxCapacity')} />}
          </Field>
          <Field label="Date" required error={errors.StartDate}>
            {(p) => <input {...p} type="date" {...bind('StartDate')} />}
          </Field>
          <Field label="Start time" required error={errors.StartTime}>
            {(p) => <input {...p} type="time" {...bind('StartTime')} />}
          </Field>
          <Field label="End time" required error={errors.EndTime}>
            {(p) => <input {...p} type="time" {...bind('EndTime')} />}
          </Field>
        </div>
        <FormActions busy={busy} onCancel={onClose} label={schedule ? 'Save changes' : 'Schedule'} />
      </form>
    </Modal>
  );
}

/** Books a member into a class. With no schedule given, the user picks an upcoming class. */
export function BookClassModal({ schedule, onClose }: { schedule?: Schedule; onClose: () => void }) {
  const invalidate = useInvalidate();
  const upcoming = useList(schedules, { upcoming: 'true', pageSize: 100, sort: 'start' });
  const { values, setValues, bind, errors, formError, busy, submit } = useForm({
    ScheduleID: toStr(schedule?.ScheduleID),
    MemberID: '',
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(
      () => reservations.create(values),
      'Class booked',
      () => {
        invalidate(reservations.path, schedules.path, '/dashboard');
        onClose();
      }
    );
  };

  return (
    <Modal
      title={
        schedule ? `Book ${schedule.ClassName} · ${schedule.StartDate} ${hhmm(schedule.StartTime)}` : 'Book a class'
      }
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        {!schedule && (
          <Field label="Class" required error={errors.ScheduleID}>
            {(p) => (
              <select {...p} {...bind('ScheduleID')}>
                <option value="">{upcoming.isLoading ? 'Loading…' : 'Select an upcoming class'}</option>
                {upcoming.data?.data.map((s) => (
                  <option key={s.ScheduleID} value={s.ScheduleID} disabled={s.Booked >= s.MaxCapacity}>
                    {s.StartDate} {hhmm(s.StartTime)} · {s.ClassName} ({s.Booked}/{s.MaxCapacity}
                    {s.Booked >= s.MaxCapacity ? ', full' : ''})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Member" required error={errors.MemberID}>
          {(p) => (
            <MemberSelect
              {...p}
              value={values.MemberID}
              onChange={(MemberID) => setValues((v) => ({ ...v, MemberID }))}
            />
          )}
        </Field>
        <FormActions busy={busy} onCancel={onClose} label="Book" />
      </form>
    </Modal>
  );
}
