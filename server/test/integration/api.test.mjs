// End-to-end API tests against a real MySQL database that has schema.sql,
// 002_auth_and_scheduling.sql and seed.sql loaded (CI does this; see
// .github/workflows/ci.yml). Skipped when TEST_DB_HOST is not set.
//
// Test logins are created here and removed afterwards. Rows the tests create
// use dates far in the future so they never collide with seed or demo data.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import appModule from '../../src/app.js';
import dbModule from '../../src/db.js';
import configModule from '../../src/config.js';

const { createApp } = appModule;
const { createPool } = dbModule;
const { loadConfig } = configModule;

const enabled = Boolean(process.env.TEST_DB_HOST);
const PASSWORD = 'integration-test-password';
const ORIGIN = 'http://localhost:3000';
const ACCOUNTS = {
  manager: { Email: 'it-manager@test.local', Role: 'manager', StaffID: null },
  front_desk: { Email: 'it-frontdesk@test.local', Role: 'front_desk', StaffID: null },
  trainer: { Email: 'it-trainer@test.local', Role: 'trainer', StaffID: 5 },
  therapist: { Email: 'it-therapist@test.local', Role: 'therapist', StaffID: 16 },
};

describe.skipIf(!enabled)('API (integration)', () => {
  let pool;
  let app;
  const agents = {};
  const cleanup = { members: [], schedules: [], training: [], therapy: [] };

  beforeAll(async () => {
    const config = loadConfig({
      DB_HOST: process.env.TEST_DB_HOST,
      DB_PORT: process.env.TEST_DB_PORT || '3306',
      DB_USER: process.env.TEST_DB_USER || 'root',
      DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
      DB_NAME: process.env.TEST_DB_NAME || 'peakperformance',
      JWT_SECRET: 'x'.repeat(40),
      BCRYPT_ROUNDS: '4',
      CORS_ORIGIN: ORIGIN,
      LOGIN_RATE_LIMIT_MAX: '100',
    });
    pool = createPool(config.db);
    app = createApp({ db: pool, config });

    const hash = await bcrypt.hash(PASSWORD, 4);
    // Fresh test logins (a staff member can have only one login, so clear those too).
    await pool.query('DELETE FROM users WHERE Email LIKE ? OR StaffID IN (5, 16)', ['it-%@test.local']);
    for (const [role, a] of Object.entries(ACCOUNTS)) {
      await pool.query('INSERT INTO users (Email, PasswordHash, Role, StaffID) VALUES (?, ?, ?, ?)', [
        a.Email,
        hash,
        a.Role,
        a.StaffID,
      ]);
      agents[role] = request.agent(app);
      const res = await agents[role]
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ Email: a.Email, Password: PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const del = (table, col, ids) => ids.length && pool.query(`DELETE FROM ${table} WHERE ${col} IN (?)`, [ids]);
    await del('reservation', 'ScheduleID', cleanup.schedules);
    await del('classschedule', 'ScheduleID', cleanup.schedules);
    await del('personaltrainingsession', 'TrainingID', cleanup.training);
    await del('physicaltherapysession', 'TherapyID', cleanup.therapy);
    await del('member', 'MemberID', cleanup.members);
    await pool.query('DELETE FROM users WHERE Email LIKE ?', ['it-%@test.local']);
    await pool.end();
  });

  const as = (role) => ({
    get: (url) => agents[role].get(url),
    post: (url, body) => agents[role].post(url).set('Origin', ORIGIN).send(body),
    put: (url, body) => agents[role].put(url).set('Origin', ORIGIN).send(body),
    patch: (url, body) => agents[role].patch(url).set('Origin', ORIGIN).send(body),
    del: (url) => agents[role].delete(url).set('Origin', ORIGIN),
  });

  describe('auth', () => {
    it('rejects anonymous requests', async () => {
      expect((await request(app).get('/api/members')).status).toBe(401);
    });

    it('rejects a wrong password with a generic message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ Email: ACCOUNTS.manager.Email, Password: 'wrong-password-123' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('sets an httpOnly SameSite=Strict cookie and returns permissions', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ Email: ACCOUNTS.trainer.Email, Password: PASSWORD });
      expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
      expect(res.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
      expect(res.body.permissions).toContain('training:write');
      expect(res.body).not.toHaveProperty('PasswordHash');
    });

    it('blocks cross-site writes', async () => {
      const res = await agents.manager
        .post('/api/checkins')
        .set('Origin', 'https://evil.example')
        .send({ MemberID: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe('members', () => {
    it('paginates, searches and sorts', async () => {
      const res = await as('front_desk').get('/api/members?pageSize=3&sort=name&order=desc');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 3, sort: 'name', order: 'desc' });

      const search = await as('front_desk').get('/api/members?q=lopez');
      expect(search.body.data.map((m) => m.LastName)).toContain('Lopez');
    });

    it('creates, updates and rejects a duplicate email', async () => {
      const body = {
        FirstName: 'Test',
        LastName: 'Member',
        Email: 'it-member@test.local',
        Phone: '555-0000',
        Address: '1 Test St',
        PlanID: 1,
      };
      const created = await as('front_desk').post('/api/members', body);
      expect(created.status).toBe(201);
      cleanup.members.push(created.body.MemberID);

      const dupe = await as('front_desk').post('/api/members', body);
      expect(dupe.status).toBe(409);
      expect(dupe.body.error).toBe('A member with that email already exists');

      const updated = await as('front_desk').put(`/api/members/${created.body.MemberID}`, { ...body, PlanID: 3 });
      expect(updated.body.PlanName).toBe('Gold');
    });

    it('only lets managers delete, and explains when history blocks it', async () => {
      expect((await as('front_desk').del('/api/members/1')).status).toBe(403);
      const res = await as('manager').del('/api/members/1');
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/still reference this one/);
    });
  });

  describe('double-booking', () => {
    const slot = { StartDate: '2031-06-02', EndDate: '2031-06-02' };

    it('stops a class from using a busy room or instructor', async () => {
      const first = await as('manager').post('/api/schedules', {
        ...slot,
        StartTime: '09:00',
        EndTime: '10:00',
        ClassID: 1,
        StaffID: 11,
        RoomID: 5,
        MaxCapacity: 10,
      });
      expect(first.status).toBe(201);
      cleanup.schedules.push(first.body.ScheduleID);

      const clash = await as('manager').post('/api/schedules', {
        ...slot,
        StartTime: '09:30',
        EndTime: '10:30',
        ClassID: 2,
        StaffID: 11,
        RoomID: 5,
        MaxCapacity: 10,
      });
      expect(clash.status).toBe(409);
      expect(clash.body.details.map((d) => d.field).sort()).toEqual(['RoomID', 'StaffID']);

      // Back-to-back is fine.
      const next = await as('manager').post('/api/schedules', {
        ...slot,
        StartTime: '10:00',
        EndTime: '11:00',
        ClassID: 2,
        StaffID: 11,
        RoomID: 5,
        MaxCapacity: 10,
      });
      expect(next.status).toBe(201);
      cleanup.schedules.push(next.body.ScheduleID);
    });

    it('rejects a class bigger than its room', async () => {
      const res = await as('manager').post('/api/schedules', {
        ...slot,
        StartTime: '15:00',
        EndTime: '16:00',
        ClassID: 1,
        StaffID: 12,
        RoomID: 10,
        MaxCapacity: 50,
      });
      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('MaxCapacity');
    });

    it('checks staff across training and therapy', async () => {
      const pt = await as('trainer').post('/api/training', {
        ...slot,
        StartTime: '12:00',
        EndTime: '13:00',
        StaffID: 5,
        MemberID: 2,
      });
      expect(pt.status).toBe(201);
      cleanup.training.push(pt.body.TrainingID);

      const memberClash = await as('therapist').post('/api/therapy', {
        StaffID: 16,
        MemberID: 2,
        AppointmentDate: '2031-06-02T12:30',
        DurationMinutes: 30,
      });
      expect(memberClash.status).toBe(409);
      expect(memberClash.body.details[0].field).toBe('MemberID');
    });

    it('lets trainers manage only their own sessions', async () => {
      const res = await as('trainer').post('/api/training', {
        ...slot,
        StartTime: '14:00',
        EndTime: '15:00',
        StaffID: 6,
        MemberID: 3,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('therapy notes', () => {
    it('are hidden from front desk and visible to the treating therapist', async () => {
      const created = await as('therapist').post('/api/therapy', {
        StaffID: 16,
        MemberID: 4,
        AppointmentDate: '2031-06-03 09:00',
        TreatmentNotes: 'Private note',
      });
      expect(created.status).toBe(201);
      cleanup.therapy.push(created.body.TherapyID);

      const desk = await as('front_desk').get(`/api/therapy/${created.body.TherapyID}`);
      expect(desk.body).toMatchObject({ TreatmentNotes: null, NotesHidden: true });

      const mine = await as('therapist').get(`/api/therapy/${created.body.TherapyID}`);
      expect(mine.body.TreatmentNotes).toBe('Private note');

      // Front desk can reschedule without wiping the notes...
      const moved = await as('front_desk').put(`/api/therapy/${created.body.TherapyID}`, {
        StaffID: 16,
        MemberID: 4,
        AppointmentDate: '2031-06-03 11:00',
      });
      expect(moved.status).toBe(200);
      expect((await as('manager').get(`/api/therapy/${created.body.TherapyID}`)).body.TreatmentNotes).toBe(
        'Private note'
      );

      // ...but can't write them, and search can't reveal them.
      const write = await as('front_desk').put(`/api/therapy/${created.body.TherapyID}`, {
        StaffID: 16,
        MemberID: 4,
        AppointmentDate: '2031-06-03 11:00',
        TreatmentNotes: 'x',
      });
      expect(write.status).toBe(403);
      expect((await as('front_desk').get('/api/therapy?q=Private')).body.meta.total).toBe(0);

      expect((await as('trainer').get('/api/therapy')).status).toBe(403);
    });
  });

  describe('reservations', () => {
    it('books a future class and refuses a second booking for the same member', async () => {
      const sched = await as('manager').post('/api/schedules', {
        StartDate: '2031-06-04',
        StartTime: '08:00',
        EndDate: '2031-06-04',
        EndTime: '09:00',
        ClassID: 3,
        StaffID: 13,
        RoomID: 7,
        MaxCapacity: 1,
      });
      cleanup.schedules.push(sched.body.ScheduleID);

      const booked = await as('front_desk').post('/api/reservations', {
        ScheduleID: sched.body.ScheduleID,
        MemberID: 1,
      });
      expect(booked.status).toBe(201);
      expect(
        (await as('front_desk').post('/api/reservations', { ScheduleID: sched.body.ScheduleID, MemberID: 1 })).status
      ).toBe(409);
      const full = await as('front_desk').post('/api/reservations', { ScheduleID: sched.body.ScheduleID, MemberID: 2 });
      expect(full.body.error).toBe('This class is full');
    });
  });

  it('returns dashboard KPIs, with revenue only for managers', async () => {
    const mgr = await as('manager').get('/api/dashboard');
    expect(mgr.status).toBe(200);
    expect(mgr.body.checkInsByDay).toHaveLength(30);
    expect(typeof mgr.body.kpis.monthlyRecurringRevenue).toBe('number');
    expect((await as('front_desk').get('/api/dashboard')).body.kpis.monthlyRecurringRevenue).toBeNull();
  });
});
