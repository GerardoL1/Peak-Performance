import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { classes } from '../api/resources';
import type { GymClass } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { difficultyColor } from '../api/labels';
import { DataTable, Pagination, type Column } from '../components/DataTable';
import { Field, FormActions } from '../components/Form';
import { PageHeader } from '../components/Layout';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchBox } from '../components/SearchBox';
import { useToast } from '../components/Toast';
import { toStr, useForm } from '../hooks/useForm';
import { useInvalidate, useList } from '../hooks/useList';
import { useListParams } from '../hooks/useListParams';

export function ClassesPage() {
  const { can } = useAuth();
  const { params, set, toggleSort } = useListParams({ sort: 'name' });
  const { data, isFetching, errorMessage } = useList(classes, params);
  const invalidate = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<GymClass | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GymClass | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    if (!deleting) return;
    try {
      await classes.remove(deleting.ClassID);
      toast(`Deleted ${deleting.ClassName}`);
      setDeleting(null);
      invalidate(classes.path, '/lookups');
    } catch (err) {
      setDeleteError(describeError(err));
    }
  };

  const columns: Column<GymClass>[] = [
    { header: 'Class', sort: 'name', cell: (c) => <strong>{c.ClassName}</strong> },
    { header: 'Description', cell: (c) => <span className="muted">{c.ClassDescription}</span> },
    {
      header: 'Difficulty',
      sort: 'difficulty',
      cell: (c) => <span className={`badge ${difficultyColor[c.DifficultyLevel]}`}>{c.DifficultyLevel}</span>,
    },
    { header: 'Duration', sort: 'duration', cell: (c) => `${c.Duration} min` },
  ];
  if (can('classes:write')) {
    columns.push({
      header: 'Actions',
      className: 'actions',
      cell: (c) => (
        <>
          <button
            type="button"
            className="button button-small"
            onClick={() => setEditing(c)}
            aria-label={`Edit ${c.ClassName}`}
          >
            Edit
          </button>
          <button
            type="button"
            className="button button-small button-danger"
            onClick={() => {
              setDeleteError(null);
              setDeleting(c);
            }}
            aria-label={`Delete ${c.ClassName}`}
          >
            Delete
          </button>
        </>
      ),
    });
  }

  return (
    <div>
      <PageHeader title="Class catalog" count={data?.meta.total}>
        {can('classes:write') && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            Add class
          </button>
        )}
      </PageHeader>
      <div className="toolbar">
        <SearchBox label="Search classes" value={toStr(params.q)} onSearch={(q) => set({ q })} />
        <label className="inline-field">
          Difficulty
          <select value={toStr(params.difficulty)} onChange={(e) => set({ difficulty: e.target.value })}>
            <option value="">All</option>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </label>
      </div>
      <DataTable
        caption="Classes"
        columns={columns}
        rows={data?.data}
        rowKey={(c) => c.ClassID}
        loading={isFetching}
        error={errorMessage}
        sort={{ key: toStr(params.sort), order: toStr(params.order), onSort: toggleSort }}
      />
      <Pagination meta={data?.meta} onPage={(page) => set({ page }, { resetPage: false })} />

      {editing && <ClassForm gymClass={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete class"
          message={
            <p>
              Delete <strong>{deleting.ClassName}</strong>? Classes that are on the schedule can't be deleted.
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

function ClassForm({ gymClass, onClose }: { gymClass: GymClass | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const { bind, values, errors, formError, busy, submit } = useForm({
    ClassName: gymClass?.ClassName ?? '',
    ClassDescription: toStr(gymClass?.ClassDescription),
    DifficultyLevel: gymClass?.DifficultyLevel ?? 'Beginner',
    Duration: toStr(gymClass?.Duration ?? 60),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(
      () => (gymClass ? classes.update(gymClass.ClassID, values) : classes.create(values)),
      gymClass ? 'Class updated' : 'Class added',
      () => {
        invalidate(classes.path, '/lookups');
        onClose();
      }
    );
  };

  return (
    <Modal title={gymClass ? `Edit ${gymClass.ClassName}` : 'Add a class'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert" role="alert">
            {formError}
          </p>
        )}
        <div className="form-grid">
          <Field label="Name" required error={errors.ClassName}>
            {(p) => <input {...p} {...bind('ClassName')} />}
          </Field>
          <Field label="Difficulty" required error={errors.DifficultyLevel}>
            {(p) => (
              <select {...p} {...bind('DifficultyLevel')}>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            )}
          </Field>
          <Field label="Duration (minutes)" required error={errors.Duration}>
            {(p) => <input {...p} type="number" min={1} max={600} {...bind('Duration')} />}
          </Field>
          <Field label="Description" error={errors.ClassDescription}>
            {(p) => <textarea {...p} rows={3} {...bind('ClassDescription')} />}
          </Field>
        </div>
        <FormActions busy={busy} onCancel={onClose} label={gymClass ? 'Save changes' : 'Add class'} />
      </form>
    </Modal>
  );
}
