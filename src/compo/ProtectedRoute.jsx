import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { GetCurrentUser } from "../apiCalls/users";

export default function ProtectedRoute({ children, roles }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const result = await GetCurrentUser();
        if (result && result.success && result.data) {
          setUser(result.data);
          try { localStorage.setItem("user", JSON.stringify(result.data)); } catch {
            //ignore
          }
        } else {
          // Token present but validation failed (e.g., 401). Allow non-role routes.
          setUser({});
        }
      } catch {
        // Network or 401 error — allow non-role routes, but you may refresh login later
        setUser({});
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) return null; // or a spinner

  if (!user) return <Navigate to="/login" replace />;

  if (Array.isArray(roles) && roles.length) {
    const role = String(user.role || "").toLowerCase();
    const ok = roles.map((r) => String(r).toLowerCase()).includes(role);
    if (!ok) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
