import { useState, type FormEvent } from 'react';
import { patch } from '../api/client';
import { ROLE_LABEL } from '../api/labels';
import { fullName, users } from '../api/resources';
import type { AppUser } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DataTable, Pagination, type Column } from '../components/DataTable';
import { Field, FormActions } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { Modal } from '../components/Modal';
import { SearchBox } from '../components/SearchBox';
import { toStr, useForm } from '../hooks/useForm';
import { useLookups } from '../hooks/useLookups';
import { useInvalidate, useList } from '../hooks/useList';
import { useListParams } from '../hooks/useListParams';

const ROLES = Object.keys(ROLE_LABEL);

export function UsersPage() {
  const { params, set, toggleSort } = useListParams();
  const { data, isFetching, errorMessage } = useList(users, params);
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);

  const columns: Column<AppUser>[] = [
    { header: 'Email', sort: 'email', cell: (u) => <strong>{u.Email}</strong> },
    { header: 'Role', sort: 'role', cell: (u) => <span className="badge badge-navy">{ROLE_LABEL[u.Role]}</span> },
    { header: 'Staff member', cell: (u) => fullName(u.StaffFirstName, u.StaffLastName) || '—' },
    {
      header: 'Status',
      cell: (u) =>
        u.IsActive ? (
          <span className="badge badge-green">Active</span>
        ) : (
          <span className="badge badge-red">Disabled</span>
        ),
    },
    { header: 'Last sign-in', sort: 'lastLogin', cell: (u) => u.LastLoginAt ?? 'Never' },
    {
      header: 'Actions',
      className: 'actions',
      cell: (u) => (
        <button
          type="button"
          className="button button-small"
          onClick={() => setEditing(u)}
          aria-label={`Edit ${u.Email}`}
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="User accounts" count={data?.meta.total}>
        <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
          Add login
        </button>
      </PageHeader>
      <p className="muted page-intro">
        Logins for staff. Trainers and therapists must be linked to their staff record; that link decides which sessions
        they can manage.
      </p>
      <div className="toolbar">
        <SearchBox label="Search email or name" value={toStr(params.q)} onSearch={(q) => set({ q })} />
      </div>
      <DataTable
        caption="User accounts"
        columns={columns}
        rows={data?.data}
        rowKey={(u) => u.UserID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort ?? 'email'), order: toStr(params.order), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />
      {editing && <UserForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserForm({ account, onClose }: { account: AppUser | null; onClose: () => void }) {
  const { user: me } = useAuth();
  const { data: lookups } = useLookups();
  const invalidate = useInvalidate();
  const isSelf = account?.UserID === me?.UserID;
  const { values, bind, errors, formError, busy, submit } = useForm({
    Email: account?.Email ?? '',
    Role: account?.Role ?? 'front_desk',
    StaffID: toStr(account?.StaffID),
    IsActive: account ? String(account.IsActive === 1) : 'true',
    Password: '',
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const action = account
      ? () =>
          patch(`${users.path}/${account.UserID}`, {
            Role: values.Role,
            StaffID: values.StaffID || null,
            IsActive: values.IsActive === 'true',
            ...(values.Password ? { Password: values.Password } : {}),
          })
      : () =>
          users.create({
            Email: values.Email,
            Password: values.Password,
            Role: values.Role,
            StaffID: values.StaffID || null,
          });
    submit(action, account ? 'Login updated' : 'Login created', () => {
      invalidate(users.path, '/staff');
      onClose();
    });
  };

  return (
    <Modal title={account ? `Edit ${account.Email}` : 'Add a login'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          {!account && (
            <Field label="Email" required error={errors.Email}>
              {(p) => <input {...p} type="email" autoComplete="off" {...bind('Email')} />}
            </Field>
          )}
          <Field label="Role" required error={errors.Role}>
            {(p) => (
              <select {...p} {...bind('Role')} disabled={isSelf}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Staff member" error={errors.StaffID} hint="Required for trainers and therapists">
            {(p) => (
              <select {...p} {...bind('StaffID')}>
                <option value="">None</option>
                {lookups?.staff.map((s) => (
                  <option key={s.StaffID} value={s.StaffID}>
                    {s.FirstName} {s.LastName} ({s.RoleName})
                  </option>
                ))}
              </select>
            )}
          </Field>
          {account && (
            <Field label="Status" error={errors.IsActive}>
              {(p) => (
                <select {...p} {...bind('IsActive')} disabled={isSelf}>
                  <option value="true">Active</option>
                  <option value="false">Disabled</option>
                </select>
              )}
            </Field>
          )}
          <Field
            label={account ? 'New password' : 'Password'}
            required={!account}
            error={errors.Password}
            hint={
              account
                ? 'Leave blank to keep the current password. Changing it signs the user out everywhere.'
                : 'At least 12 characters'
            }
          >
            {(p) => <input {...p} type="password" autoComplete="new-password" {...bind('Password')} />}
          </Field>
        </div>
        <FormActions busy={busy} onCancel={onClose} label={account ? 'Save changes' : 'Create login'} />
      </form>
    </Modal>
  );
}
