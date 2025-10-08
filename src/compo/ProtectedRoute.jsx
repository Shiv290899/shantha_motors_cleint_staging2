import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { GetCurrentUser } from "../apiCalls/users";

export default function ProtectedRoute({ children, roles }) {
  const [loading, setLoading] = useState(true);
  // Seed from localStorage so UI can recover if token validation fails but we still know the role
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        // No token: treat as unauthenticated (do not rely on cached user)
        try { localStorage.removeItem("user"); } catch {
          //ijhishd
        }
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
        }
      } catch {
        // On auth failure, clear user to force login again
        try { localStorage.removeItem("user"); } catch {
          //sdbf
        }
        setUser(null);
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
