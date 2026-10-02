import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { fullName, hhmm, training } from '../api/resources';
import type { TrainingSession } from '../api/types';
import { useAuth } from '../auth/AuthContext';
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

export function TrainingPage() {
  const { user, can } = useAuth();
  const isTrainer = user?.Role === 'trainer';
  const { params, set, toggleSort } = useListParams(isTrainer ? { mine: 'true' } : {});
  const { data, isFetching, errorMessage } = useList(training, params);
  const invalidate = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<TrainingSession | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TrainingSession | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Trainers can only change their own sessions (the API enforces this too).
  const canEdit = (t: TrainingSession) => can('training:write') && (!isTrainer || t.StaffID === user?.StaffID);

  const remove = async () => {
    if (!deleting) return;
    try {
      await training.remove(deleting.TrainingID);
      toast('Session deleted');
      setDeleting(null);
      invalidate(training.path, '/dashboard');
    } catch (err) {
      setDeleteError(describeError(err));
    }
  };

  const columns: Column<TrainingSession>[] = [
    { header: 'Date', sort: 'start', cell: (t) => <span className="nowrap">{t.StartDate}</span> },
    {
      header: 'Time',
      cell: (t) => (
        <span className="nowrap">
          {hhmm(t.StartTime)}–{hhmm(t.EndTime)}
        </span>
      ),
    },
    { header: 'Member', sort: 'member', cell: (t) => <strong>{fullName(t.MemberFirstName, t.MemberLastName)}</strong> },
    { header: 'Trainer', sort: 'trainer', cell: (t) => fullName(t.StaffFirstName, t.StaffLastName) },
    { header: 'Notes', cell: (t) => <span className="muted">{t.SessionNotes}</span> },
    {
      header: 'Actions',
      className: 'actions',
      cell: (t) =>
        canEdit(t) ? (
          <>
            <button
              type="button"
              className="button button-small"
              onClick={() => setEditing(t)}
              aria-label={`Edit session on ${t.StartDate}`}
            >
              Edit
            </button>
            <button
              type="button"
              className="button button-small button-danger"
              onClick={() => {
                setDeleteError(null);
                setDeleting(t);
              }}
              aria-label={`Delete session on ${t.StartDate}`}
            >
              Delete
            </button>
          </>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Personal training" count={data?.meta.total}>
        {can('training:write') && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            Add session
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <SearchBox label="Search member, trainer or notes" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          From <input type="date" value={toStr(params.from)} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="inline-field">
          To <input type="date" value={toStr(params.to)} onChange={(e) => set({ to: e.target.value })} />
        </label>
        {user?.StaffID && (
          <label className="inline-field">
            <input
              type="checkbox"
              checked={params.mine === 'true'}
              onChange={(e) => set({ mine: e.target.checked ? 'true' : 'false' })}
            />
            Only my sessions
          </label>
        )}
      </div>

      <DataTable
        caption="Personal training sessions"
        columns={columns}
        rows={data?.data}
        rowKey={(t) => t.TrainingID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort ?? 'start'), order: toStr(params.order ?? 'desc'), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {editing && <TrainingForm session={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete training session"
          message={
            <p>
              Delete the session with <strong>{fullName(deleting.MemberFirstName, deleting.MemberLastName)}</strong> on{' '}
              {deleting.StartDate}?
            </p>
          }
          confirmLabel="Delete"
          error={deleteError}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function TrainingForm({ session, onClose }: { session: TrainingSession | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const isTrainer = user?.Role === 'trainer';
  const { values, setValues, bind, errors, formError, busy, submit } = useForm({
    StaffID: toStr(session?.StaffID ?? (isTrainer ? user?.StaffID : '')),
    MemberID: toStr(session?.MemberID),
    StartDate: session?.StartDate ?? '',
    StartTime: hhmm(session?.StartTime),
    EndTime: hhmm(session?.EndTime),
    SessionNotes: toStr(session?.SessionNotes),
  });
  const trainers =
    lookups?.staff.filter((s) => s.RoleName === 'Personal Trainer' || s.StaffID === session?.StaffID) ?? [];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = { ...values, EndDate: values.StartDate };
    submit(
      () => (session ? training.update(session.TrainingID, body) : training.create(body)),
      session ? 'Session updated' : 'Session booked',
      () => {
        invalidate(training.path, '/dashboard');
        onClose();
      }
    );
  };

  return (
    <Modal title={session ? 'Edit training session' : 'Book a training session'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          <Field label="Trainer" required error={errors.StaffID}>
            {(p) => (
              <select {...p} {...bind('StaffID')} disabled={isTrainer}>
                <option value="">Select a trainer</option>
                {trainers.map((s) => (
                  <option key={s.StaffID} value={s.StaffID}>
                    {s.FirstName} {s.LastName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Member" required error={errors.MemberID}>
            {(p) => (
              <MemberSelect
                {...p}
                value={values.MemberID}
                onChange={(MemberID) => setValues((v) => ({ ...v, MemberID }))}
                currentLabel={session ? fullName(session.MemberFirstName, session.MemberLastName) : undefined}
              />
            )}
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
          <Field label="Session notes" error={errors.SessionNotes}>
            {(p) => <textarea {...p} rows={3} {...bind('SessionNotes')} />}
          </Field>
        </div>
        <FormActions busy={busy} onCancel={onClose} label={session ? 'Save changes' : 'Book session'} />
      </form>
    </Modal>
  );
}
