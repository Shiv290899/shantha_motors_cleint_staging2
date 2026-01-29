import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GetCurrentUser } from '../apiCalls/users';
import { routeForRole } from '../utils/roleRoute';

export default function RoleRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try {
        let user = null;
        try { const raw = localStorage.getItem('user'); user = raw ? JSON.parse(raw) : null; } catch {
          //subf
        }
        if (!user) {
          const resp = await GetCurrentUser().catch(() => null);
          if (resp?.success && resp.data) { user = resp.data; localStorage.setItem('user', JSON.stringify(user)); }
        }
        const to = routeForRole(user?.role);
        navigate(to, { replace: true });
      } catch {
        navigate('/staff', { replace: true });
      }
    })();
  }, [navigate]);
  return null;
}

