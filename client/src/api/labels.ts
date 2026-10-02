// Badge colours shared across pages.

export const planColor: Record<string, string> = {
  Basic: 'badge-gray',
  Silver: 'badge-blue',
  Gold: 'badge-amber',
  Platinum: 'badge-purple',
  Student: 'badge-green',
};

export const roleColor: Record<string, string> = {
  'General Manager': 'badge-navy',
  'Front Desk Associate': 'badge-blue',
  'Personal Trainer': 'badge-green',
  'Group Fitness Instructor': 'badge-purple',
  'Physical Therapist': 'badge-amber',
};

export const difficultyColor: Record<string, string> = {
  Beginner: 'badge-green',
  Intermediate: 'badge-amber',
  Advanced: 'badge-red',
};

export const statusColor: Record<string, string> = {
  Booked: 'badge-blue',
  Attended: 'badge-green',
  Cancelled: 'badge-red',
};

export const ROLE_LABEL: Record<string, string> = {
  manager: 'Manager',
  front_desk: 'Front desk',
  trainer: 'Trainer',
  therapist: 'Therapist',
};
