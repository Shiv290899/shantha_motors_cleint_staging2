export function routeForRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return '/admin';
  if (r === 'owner') return '/owner';
  if (r === 'mechanic') return '/mechanic';
  if (r === 'backend') return '/backend';
  if (r === 'employees') return '/employees';
  if (r === 'executive') return '/staff';
  if (r === 'staff') return '/staff';
  return '/staff';
}
