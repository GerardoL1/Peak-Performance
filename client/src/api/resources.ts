import { resource } from './client';
import type {
  AppUser,
  CheckIn,
  GymClass,
  Member,
  Reservation,
  Schedule,
  Staff,
  TherapySession,
  TrainingSession,
} from './types';

export const members = resource<Member>('/members');
export const staff = resource<Staff>('/staff');
export const classes = resource<GymClass>('/classes');
export const schedules = resource<Schedule>('/schedules');
export const reservations = resource<Reservation>('/reservations');
export const training = resource<TrainingSession>('/training');
export const therapy = resource<TherapySession>('/therapy');
export const checkins = resource<CheckIn>('/checkins');
export const users = resource<AppUser>('/users');

export const fullName = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(' ');
export const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '');
