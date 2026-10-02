import { describe, it, expect } from 'vitest';
import validation from '../../src/validation.js';
import listQuery from '../../src/listQuery.js';
import permissions from '../../src/permissions.js';

const { validate, memberSchema, trainingSchema, therapySchema, userCreateSchema, addMinutes, parseId } = validation;
const { parseListQuery, paginate, Where, escapeLike } = listQuery;
const { can, permissionsFor } = permissions;

const errorsOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return Object.fromEntries(err.details.map((d) => [d.field, d.message]));
  }
  throw new Error('expected a validation error');
};

describe('validation', () => {
  it('normalizes a valid member', () => {
    const m = validate(memberSchema, {
      FirstName: '  Ana ',
      LastName: 'Diaz',
      Email: 'ANA@Example.com',
      Phone: '555',
      Address: '1 Main',
      DOB: '',
      PlanID: '2',
    });
    expect(m).toMatchObject({ FirstName: 'Ana', Email: 'ana@example.com', DOB: null, PlanID: 2 });
  });

  it('reports every bad member field', () => {
    const errors = errorsOf(() => validate(memberSchema, { Email: 'nope', DOB: '2999-01-01' }));
    expect(errors).toMatchObject({
      FirstName: 'Required',
      Email: 'Invalid email',
      PlanID: 'Required',
      DOB: 'Birthday cannot be in the future',
    });
  });

  it('rejects sessions that end before they start', () => {
    const errors = errorsOf(() =>
      validate(trainingSchema, {
        StaffID: 5,
        MemberID: 1,
        StartDate: '2030-01-01',
        StartTime: '10:00',
        EndDate: '2030-01-01',
        EndTime: '09:00',
      })
    );
    expect(errors.EndTime).toBe('End must be after start');
  });

  it('accepts datetime-local input for therapy and defaults the duration', () => {
    const t = validate(therapySchema, {
      StaffID: 16,
      MemberID: 1,
      AppointmentDate: '2030-01-01T09:30',
      DurationMinutes: '',
    });
    expect(t).toMatchObject({ AppointmentDate: '2030-01-01 09:30:00', DurationMinutes: 60 });
  });

  it('requires a staff link for trainer logins', () => {
    const errors = errorsOf(() =>
      validate(userCreateSchema, { Email: 'a@b.co', Password: 'long-enough-pw', Role: 'trainer' })
    );
    expect(errors.StaffID).toMatch(/linked to a staff member/);
  });

  it('adds minutes across midnight', () => {
    expect(addMinutes('2030-01-01 23:30:00', 60)).toBe('2030-01-02 00:30:00');
  });

  it('rejects non-numeric ids', () => {
    expect(() => parseId('1 OR 1=1')).toThrow('Invalid id');
  });
});

describe('list queries', () => {
  it('applies defaults and caps page size', () => {
    expect(parseListQuery({})).toMatchObject({ page: 1, pageSize: 25 });
    expect(() => parseListQuery({ pageSize: '1000' })).toThrow('Validation failed');
  });

  it('escapes LIKE wildcards in search', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
  });

  it('only sorts by whitelisted keys and builds parameterized SQL', async () => {
    const calls = [];
    const db = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return sql.includes('COUNT(*)') ? [[{ total: 42 }]] : [[{ id: 1 }]];
      },
    };
    const opts = {
      select: 'm.*',
      from: 'FROM member m',
      where: new Where().search(['m.Email'], 'x'),
      sortable: { name: ['m.LastName', 'm.FirstName'] },
      defaultSort: { key: 'name' },
      idColumn: 'm.MemberID',
    };

    const page = await paginate(db, parseListQuery({ page: '2', pageSize: '10', order: 'desc' }), opts);
    expect(page.meta).toMatchObject({ page: 2, pageSize: 10, total: 42, totalPages: 5 });
    expect(calls[1].sql).toContain('ORDER BY m.LastName DESC, m.FirstName DESC, m.MemberID DESC LIMIT ? OFFSET ?');
    expect(calls[1].params).toEqual(['%x%', 10, 10]);

    await expect(paginate(db, parseListQuery({ sort: 'Email; DROP TABLE member' }), opts)).rejects.toThrow(
      'Cannot sort by'
    );
  });
});

describe('permissions', () => {
  it('limits member deletion and therapy notes', () => {
    expect(can('manager', 'members:delete')).toBe(true);
    expect(can('front_desk', 'members:delete')).toBe(false);
    expect(can('front_desk', 'therapy:notes')).toBe(false);
    expect(can('trainer', 'therapy:read')).toBe(false);
  });

  it('lists permissions for a role', () => {
    expect(permissionsFor('trainer')).toContain('training:write');
    expect(permissionsFor('trainer')).not.toContain('users:manage');
  });
});

describe('database error mapping', () => {
  it('explains blocked deletes for both root (1451) and least-privilege users (1217)', async () => {
    const { mapDbError } = (await import('../../src/errors.js')).default;
    for (const errno of [1451, 1217]) {
      const err = mapDbError({ errno, sqlMessage: '' });
      expect(err.status).toBe(409);
      expect(err.message).toMatch(/still reference this one/);
    }
    expect(mapDbError({ errno: 1216, sqlMessage: '' }).status).toBe(400);
    expect(mapDbError({ errno: 1062, sqlMessage: "Duplicate entry for key 'member.uq_member_email'" }).message).toBe(
      'A member with that email already exists'
    );
  });
});
