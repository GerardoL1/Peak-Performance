// Role-based access control. This table is the single source of truth: the API
// enforces it, and GET /api/auth/me sends the caller's list to the frontend so
// the UI only shows what the user can actually do.
//
// Some permissions are further scoped by ownership in the route handlers:
//   training:write  a trainer can only create/edit/delete their OWN sessions
//   therapy:write   a therapist can only create/edit/delete their OWN appointments
//   therapy:notes   treatment notes are visible to managers and the treating therapist only

const ROLE_LABELS = {
  manager: 'Manager',
  front_desk: 'Front desk',
  trainer: 'Trainer',
  therapist: 'Therapist',
};

const ALL = Object.keys(ROLE_LABELS);

const PERMISSIONS = {
  'dashboard:read': ALL,
  'finance:read': ['manager'],

  'members:read': ALL,
  'members:write': ['manager', 'front_desk'],
  'members:delete': ['manager'],

  'staff:read': ALL,
  'staff:write': ['manager'],

  'users:manage': ['manager'],

  'catalog:read': ALL, // facilities, rooms, plans, roles, lookups
  'classes:read': ALL,
  'classes:write': ['manager'],
  'schedules:write': ['manager'],

  'reservations:read': ALL,
  'reservations:create': ['manager', 'front_desk'],
  'reservations:update': ['manager', 'front_desk', 'trainer'],

  'training:read': ['manager', 'front_desk', 'trainer'],
  'training:write': ['manager', 'front_desk', 'trainer'],

  'therapy:read': ['manager', 'front_desk', 'therapist'],
  'therapy:write': ['manager', 'front_desk', 'therapist'],
  'therapy:notes': ['manager', 'therapist'],

  'checkins:read': ALL,
  'checkins:create': ['manager', 'front_desk'],
};

function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission: ${permission}`);
  return allowed.includes(role);
}

function permissionsFor(role) {
  return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
}

/** Roles whose write access is limited to rows where StaffID is their own. */
const SELF_SCOPED_ROLES = ['trainer', 'therapist'];

module.exports = { PERMISSIONS, ROLE_LABELS, can, permissionsFor, SELF_SCOPED_ROLES };
