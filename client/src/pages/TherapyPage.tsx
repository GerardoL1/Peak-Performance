import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { fullName, therapy } from '../api/resources';
import type { TherapySession } from '../api/types';
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

export function TherapyPage() {
  const { user, can } = useAuth();
  const isTherapist = user?.Role === 'therapist';
  const { params, set, toggleSort } = useListParams(isTherapist ? { mine: 'true' } : {});
  const { data, isFetching, errorMessage } = useList(therapy, params);
  const invalidate = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<TherapySession | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TherapySession | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canEdit = (t: TherapySession) => can('therapy:write') && (!isTherapist || t.StaffID === user?.StaffID);

  const remove = async () => {
    if (!deleting) return;
    try {
      await therapy.remove(deleting.TherapyID);
      toast('Appointment deleted');
      setDeleting(null);
      invalidate(therapy.path);
    } catch (err) {
      setDeleteError(describeError(err));
    }
  };

  const columns: Column<TherapySession>[] = [
    {
      header: 'Appointment',
      sort: 'date',
      cell: (t) => <span className="nowrap">{t.AppointmentDate.slice(0, 16)}</span>,
    },
    { header: 'Length', cell: (t) => `${t.DurationMinutes} min` },
    { header: 'Member', sort: 'member', cell: (t) => <strong>{fullName(t.MemberFirstName, t.MemberLastName)}</strong> },
    { header: 'Therapist', sort: 'therapist', cell: (t) => fullName(t.StaffFirstName, t.StaffLastName) },
    {
      header: 'Referral',
      cell: (t) => (t.ReferralSource ? <span className="badge badge-amber">{t.ReferralSource}</span> : '—'),
    },
    {
      header: 'Treatment notes',
      cell: (t) =>
        t.NotesHidden ? (
          <span className="muted" title="Visible to managers and the treating therapist">
            🔒 Restricted
          </span>
        ) : (
          <span className="muted">{t.TreatmentNotes}</span>
        ),
    },
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
              aria-label={`Edit appointment on ${t.AppointmentDate}`}
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
              aria-label={`Delete appointment on ${t.AppointmentDate}`}
            >
              Delete
            </button>
          </>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Physical therapy" count={data?.meta.total}>
        {can('therapy:write') && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            Add appointment
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <SearchBox label="Search member, therapist or referral" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          From <input type="date" value={toStr(params.from)} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="inline-field">
          To <input type="date" value={toStr(params.to)} onChange={(e) => set({ to: e.target.value })} />
        </label>
        {isTherapist && (
          <label className="inline-field">
            <input
              type="checkbox"
              checked={params.mine === 'true'}
              onChange={(e) => set({ mine: e.target.checked ? 'true' : 'false' })}
            />
            Only my appointments
          </label>
        )}
      </div>

      <DataTable
        caption="Physical therapy appointments"
        columns={columns}
        rows={data?.data}
        rowKey={(t) => t.TherapyID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort ?? 'date'), order: toStr(params.order ?? 'desc'), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {editing && <TherapyForm session={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete appointment"
          message={
            <p>
              Delete the appointment for <strong>{fullName(deleting.MemberFirstName, deleting.MemberLastName)}</strong>{' '}
              on {deleting.AppointmentDate.slice(0, 16)}?
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

function TherapyForm({ session, onClose }: { session: TherapySession | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const isTherapist = user?.Role === 'therapist';
  const { values, setValues, bind, errors, formError, busy, submit } = useForm({
    StaffID: toStr(session?.StaffID ?? (isTherapist ? user?.StaffID : '')),
    MemberID: toStr(session?.MemberID),
    AppointmentDate: session ? session.AppointmentDate.slice(0, 16).replace(' ', 'T') : '',
    DurationMinutes: toStr(session?.DurationMinutes ?? 60),
    ReferralSource: toStr(session?.ReferralSource),
    TreatmentNotes: toStr(session?.TreatmentNotes),
  });
  const therapists =
    lookups?.staff.filter((s) => s.RoleName === 'Physical Therapist' || s.StaffID === session?.StaffID) ?? [];

  // Same rule as the API: managers, or the therapist running this appointment.
  const canWriteNotes = user?.Role === 'manager' || (isTherapist && values.StaffID === String(user?.StaffID));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = canWriteNotes ? values : { ...values, TreatmentNotes: '' };
    submit(
      () => (session ? therapy.update(session.TherapyID, body) : therapy.create(body)),
      session ? 'Appointment updated' : 'Appointment booked',
      () => {
        invalidate(therapy.path);
        onClose();
      }
    );
  };

  return (
    <Modal title={session ? 'Edit appointment' : 'Book a therapy appointment'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          <Field label="Therapist" required error={errors.StaffID}>
            {(p) => (
              <select {...p} {...bind('StaffID')} disabled={isTherapist}>
                <option value="">Select a therapist</option>
                {therapists.map((s) => (
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
          <Field label="Date and time" required error={errors.AppointmentDate}>
            {(p) => <input {...p} type="datetime-local" {...bind('AppointmentDate')} />}
          </Field>
          <Field label="Length (minutes)" required error={errors.DurationMinutes}>
            {(p) => <input {...p} type="number" min={15} max={480} step={15} {...bind('DurationMinutes')} />}
          </Field>
          <Field label="Referral source" error={errors.ReferralSource}>
            {(p) => <input {...p} {...bind('ReferralSource')} />}
          </Field>
          {canWriteNotes ? (
            <Field label="Treatment notes" error={errors.TreatmentNotes}>
              {(p) => <textarea {...p} rows={4} {...bind('TreatmentNotes')} />}
            </Field>
          ) : (
            <p className="hint">Treatment notes are only visible to managers and the treating therapist.</p>
          )}
        </div>
        <FormActions busy={busy} onCancel={onClose} label={session ? 'Save changes' : 'Book appointment'} />
      </form>
    </Modal>
  );
}
