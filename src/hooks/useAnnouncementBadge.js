import { useEffect, useMemo, useState } from 'react';
import { listAnnouncementsPublic } from '../apiCalls/announcements';
import { GetCurrentUser } from '../apiCalls/users';

function keyFor(user) {
  const k = user?.email || user?.name || 'user';
  return `Announcements:lastSeen:${k}`;
}

export default function useAnnouncementBadge() {
  const [user, setUser] = useState(null);
  const [latest, setLatest] = useState(0);
  const [latestItem, setLatestItem] = useState(null);
  const [hasNew, setHasNew] = useState(false);

  const lastSeenKey = useMemo(() => keyFor(user), [user]);

  const lastSeen = () => {
    try { const v = localStorage.getItem(lastSeenKey); return v ? parseInt(v, 10) : 0; } catch { return 0; }
  };

  const refresh = async () => {
    try {
      const res = await listAnnouncementsPublic({ limit: 1 });
      const items = Array.isArray(res?.data) ? res.data : [];
      const top = items[0] || null;
      const ms = top && top.createdAt ? new Date(top.createdAt).getTime() : 0;
      setLatest(ms || 0);
      setLatestItem(top);
      setHasNew(ms > lastSeen());
    } catch {
      setHasNew(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem('user');
        if (raw) setUser(JSON.parse(raw));
        else {
          const resp = await GetCurrentUser().catch(()=>null);
          if (resp?.success && resp.data) { setUser(resp.data); localStorage.setItem('user', JSON.stringify(resp.data)); }
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    // listen for manual refresh triggers
    const handler = () => refresh();
    window.addEventListener('ann-refresh', handler);
    return () => window.removeEventListener('ann-refresh', handler);
  }, [user]);

  return { hasNew, latest, latestItem, refresh };
}
