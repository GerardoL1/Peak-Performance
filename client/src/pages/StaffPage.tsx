import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { staff } from '../api/resources';
import type { Staff } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { roleColor } from '../api/labels';
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

export function StaffPage() {
  const { can } = useAuth();
  const { params, set, toggleSort } = useListParams({ sort: 'name' });
  const { data, isFetching, errorMessage } = useList(staff, params);
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Staff | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    if (!deleting) return;
    try {
      await staff.remove(deleting.StaffID);
      toast(`Removed ${deleting.FirstName} ${deleting.LastName}`);
      setDeleting(null);
      invalidate(staff.path, '/lookups');
    } catch (err) {
      setDeleteError(describeError(err));
    }
  };

  const columns: Column<Staff>[] = [
    {
      header: 'Name',
      sort: 'name',
      cell: (s) => (
        <strong>
          {s.FirstName} {s.LastName}
        </strong>
      ),
    },
    {
      header: 'Role',
      sort: 'role',
      cell: (s) => <span className={`badge ${roleColor[s.RoleName] ?? 'badge-gray'}`}>{s.RoleName}</span>,
    },
    { header: 'Email', cell: (s) => s.Email },
    { header: 'Phone', cell: (s) => s.Phone ?? '—' },
    { header: 'Hired', sort: 'hireDate', cell: (s) => s.HireDate ?? '—' },
    {
      header: 'Login',
      cell: (s) => (s.HasLogin ? <span className="badge badge-green">Yes</span> : <span className="muted">No</span>),
    },
  ];
  if (can('staff:write')) {
    columns.push({
      header: 'Actions',
      className: 'actions',
      cell: (s) => (
        <>
          <button
            type="button"
            className="button button-small"
            onClick={() => setEditing(s)}
            aria-label={`Edit ${s.FirstName} ${s.LastName}`}
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
            aria-label={`Remove ${s.FirstName} ${s.LastName}`}
          >
            Remove
          </button>
        </>
      ),
    });
  }

  return (
    <div>
      <PageHeader title="Staff" count={data?.meta.total}>
        {can('staff:write') && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            Add staff
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <SearchBox label="Search staff" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          Role
          <select value={toStr(params.roleId)} onChange={(e) => set({ roleId: e.target.value })}>
            <option value="">All roles</option>
            {lookups?.roles.map((r) => (
              <option key={r.RoleID} value={r.RoleID}>
                {r.RoleName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        caption="Staff"
        columns={columns}
        rows={data?.data}
        rowKey={(s) => s.StaffID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort), order: toStr(params.order), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {editing && <StaffForm person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Remove staff member"
          message={
            <p>
              Remove{' '}
              <strong>
                {deleting.FirstName} {deleting.LastName}
              </strong>
              ? Staff with classes, sessions or a login can't be removed.
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

function StaffForm({ person, onClose }: { person: Staff | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const { bind, values, errors, formError, busy, submit } = useForm({
    FirstName: person?.FirstName ?? '',
    LastName: person?.LastName ?? '',
    Email: person?.Email ?? '',
    Phone: toStr(person?.Phone),
    HireDate: toStr(person?.HireDate),
    RoleID: toStr(person?.RoleID),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(
      () => (person ? staff.update(person.StaffID, values) : staff.create(values)),
      person ? 'Staff member updated' : 'Staff member added',
      () => {
        invalidate(staff.path, '/lookups');
        onClose();
      }
    );
  };

  return (
    <Modal title={person ? `Edit ${person.FirstName} ${person.LastName}` : 'Add staff member'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          <Field label="First name" required error={errors.FirstName}>
            {(p) => <input {...p} {...bind('FirstName')} />}
          </Field>
          <Field label="Last name" required error={errors.LastName}>
            {(p) => <input {...p} {...bind('LastName')} />}
          </Field>
          <Field label="Email" required error={errors.Email}>
            {(p) => <input {...p} type="email" {...bind('Email')} />}
          </Field>
          <Field label="Phone" error={errors.Phone}>
            {(p) => <input {...p} type="tel" {...bind('Phone')} />}
          </Field>
          <Field label="Hire date" error={errors.HireDate}>
            {(p) => <input {...p} type="date" {...bind('HireDate')} />}
          </Field>
          <Field label="Role" required error={errors.RoleID}>
            {(p) => (
              <select {...p} {...bind('RoleID')}>
                <option value="">Select a role</option>
                {lookups?.roles.map((r) => (
                  <option key={r.RoleID} value={r.RoleID}>
                    {r.RoleName}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <FormActions busy={busy} onCancel={onClose} label={person ? 'Save changes' : 'Add staff'} />
      </form>
    </Modal>
  );
}
