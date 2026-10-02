import { useState, type FormEvent } from 'react';
import { describeError, post } from '../api/client';
import { checkins, members } from '../api/resources';
import type { Member } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { planColor } from '../api/labels';
import { DataTable, Pagination, type Column } from '../components/DataTable';
import { Field, FormActions } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchBox } from '../components/SearchBox';
import { useToast } from '../components/Toast';
import { toStr, useForm } from '../hooks/useForm';
import { useLookups } from '../hooks/useLookups';
import { useInvalidate, useList } from '../hooks/useList';
import { useListParams } from '../hooks/useListParams';

// Local date (not UTC) so the default start date is right in the evening too.
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MembersPage() {
  const { can } = useAuth();
  const { params, set, toggleSort } = useListParams({ sort: 'id' });
  const { data, isFetching, errorMessage } = useList(members, params);
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const toast = useToast();

  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkIn = async (m: Member) => {
    try {
      await post(checkins.path, { MemberID: m.MemberID });
      toast(`${m.FirstName} ${m.LastName} checked in`);
      invalidate(checkins.path, '/dashboard');
    } catch (err) {
      toast(describeError(err), 'error');
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await members.remove(deleting.MemberID);
      toast(`Deleted ${deleting.FirstName} ${deleting.LastName}`);
      setDeleting(null);
      invalidate(members.path);
    } catch (err) {
      setDeleteError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Member>[] = [
    { header: 'ID', sort: 'id', cell: (m) => <span className="badge badge-gray">{m.MemberID}</span> },
    {
      header: 'Name',
      sort: 'name',
      cell: (m) => (
        <strong>
          {m.FirstName} {m.LastName}
        </strong>
      ),
    },
    { header: 'Email', sort: 'email', cell: (m) => m.Email },
    { header: 'Phone', cell: (m) => m.Phone },
    { header: 'Member since', sort: 'startDate', cell: (m) => m.MembershipStartDate ?? '—' },
    {
      header: 'Plan',
      sort: 'plan',
      cell: (m) => <span className={`badge ${planColor[m.PlanName] ?? 'badge-gray'}`}>{m.PlanName}</span>,
    },
    {
      header: 'Actions',
      className: 'actions',
      cell: (m) => (
        <>
          {can('checkins:create') && (
            <button
              type="button"
              className="button button-small"
              onClick={() => checkIn(m)}
              aria-label={`Check in ${m.FirstName} ${m.LastName}`}
            >
              Check in
            </button>
          )}
          {can('members:write') && (
            <button
              type="button"
              className="button button-small"
              onClick={() => setEditing(m)}
              aria-label={`Edit ${m.FirstName} ${m.LastName}`}
            >
              Edit
            </button>
          )}
          {can('members:delete') && (
            <button
              type="button"
              className="button button-small button-danger"
              onClick={() => {
                setDeleteError(null);
                setDeleting(m);
              }}
              aria-label={`Delete ${m.FirstName} ${m.LastName}`}
            >
              Delete
            </button>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Members" count={data?.meta.total}>
        {can('members:write') && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            Add member
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <SearchBox label="Search members" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          Plan
          <select value={toStr(params.planId)} onChange={(e) => set({ planId: e.target.value })}>
            <option value="">All plans</option>
            {lookups?.plans.map((p) => (
              <option key={p.PlanID} value={p.PlanID}>
                {p.PlanName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        caption="Members"
        columns={columns}
        rows={data?.data}
        rowKey={(m) => m.MemberID}
        loading={isFetching}
        error={errorMessage}
        empty={params.q || params.planId ? 'No members match your filters.' : 'No members yet.'}
        sort={{ key: toStr(params.sort), order: toStr(params.order), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {editing && <MemberForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete member"
          message={
            <p>
              Delete{' '}
              <strong>
                {deleting.FirstName} {deleting.LastName}
              </strong>
              ? This cannot be undone.
            </p>
          }
          confirmLabel="Delete"
          busy={busy}
          error={deleteError}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function MemberForm({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const { bind, values, errors, formError, busy, submit } = useForm({
    FirstName: member?.FirstName ?? '',
    LastName: member?.LastName ?? '',
    Email: member?.Email ?? '',
    Phone: member?.Phone ?? '',
    Address: member?.Address ?? '',
    DOB: toStr(member?.DOB),
    EmergencyContact: toStr(member?.EmergencyContact),
    MembershipStartDate: member ? toStr(member.MembershipStartDate) : todayLocal(),
    PlanID: toStr(member?.PlanID ?? lookups?.plans[0]?.PlanID),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(
      () => (member ? members.update(member.MemberID, values) : members.create(values)),
      member ? 'Member updated' : 'Member added',
      () => {
        invalidate(members.path);
        onClose();
      }
    );
  };

  return (
    <Modal title={member ? `Edit ${member.FirstName} ${member.LastName}` : 'Add a member'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          <Field label="First name" required error={errors.FirstName}>
            {(p) => <input {...p} {...bind('FirstName')} autoComplete="off" />}
          </Field>
          <Field label="Last name" required error={errors.LastName}>
            {(p) => <input {...p} {...bind('LastName')} autoComplete="off" />}
          </Field>
          <Field label="Email" required error={errors.Email}>
            {(p) => <input {...p} type="email" {...bind('Email')} autoComplete="off" />}
          </Field>
          <Field label="Phone" required error={errors.Phone}>
            {(p) => <input {...p} type="tel" {...bind('Phone')} autoComplete="off" />}
          </Field>
          <Field label="Address" required error={errors.Address}>
            {(p) => <input {...p} {...bind('Address')} autoComplete="off" />}
          </Field>
          <Field label="Date of birth" error={errors.DOB}>
            {(p) => <input {...p} type="date" {...bind('DOB')} />}
          </Field>
          <Field label="Emergency contact" error={errors.EmergencyContact}>
            {(p) => <input {...p} {...bind('EmergencyContact')} />}
          </Field>
          <Field label="Member since" error={errors.MembershipStartDate}>
            {(p) => <input {...p} type="date" {...bind('MembershipStartDate')} />}
          </Field>
          <Field label="Plan" required error={errors.PlanID}>
            {(p) => (
              <select {...p} {...bind('PlanID')}>
                {lookups?.plans.map((plan) => (
                  <option key={plan.PlanID} value={plan.PlanID}>
                    {plan.PlanName} (${plan.MonthlyFee}/mo)
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <FormActions busy={busy} onCancel={onClose} label={member ? 'Save changes' : 'Add member'} />
      </form>
    </Modal>
  );
}
