import { useState, useEffect } from 'react';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import InspectorDashboard from './InspectorDashboard';
import ReviewerDashboard from './ReviewerDashboard';
import ControllerDashboard from './ControllerDashboard';
import DirectorDashboard from './DirectorDashboard';
import LegacyDashboard from './LegacyDashboard';

// Role → dashboard component. Roles without a dedicated dashboard
// (MANUFACTURER, CONSUMER) fall back to the legacy generic view.
const ROLE_DASHBOARDS = {
  INSPECTOR: InspectorDashboard,
  REVIEWER: ReviewerDashboard,
  CONTROLLER: ControllerDashboard,
  DIRECTOR: DirectorDashboard,
};

function initialRole() {
  const user = api.getUser() || api.peekMe()?.data?.user;
  return String(user?.role || '').toUpperCase();
}

/**
 * Role Router: renders the dashboard appropriate to the signed-in user's
 * role. The role comes from the cached profile synchronously; if the session
 * has a token but no cached user, /auth/me hydrates it before routing.
 */
export default function Dashboard() {
  const [role, setRole] = useState(initialRole);
  // A token-only session (no cached user) needs /auth/me before it can route.
  const [resolved, setResolved] = useState(() => role !== '');

  useEffect(() => {
    const unsubscribeMe = api.subscribeMe((d) => {
      const next = String(d?.user?.role || '').toUpperCase();
      if (next && next !== role) setRole(next);
    });

    if (!resolved) {
      api
        .getMe()
        .then((data) => {
          if (data?.user) {
            api.setUser(data.user);
            setRole(String(data.user.role || '').toUpperCase());
          }
        })
        .catch((error) => console.error('Failed to load profile:', error))
        .finally(() => setResolved(true));
    }

    return unsubscribeMe;
  }, [resolved, role]);

  if (!resolved) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-52 bg-gradient-to-br from-primary/20 to-primary-container/20 rounded-3xl" />
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-surface-container-low rounded-3xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const RoleDashboard = ROLE_DASHBOARDS[role] || LegacyDashboard;
  return <RoleDashboard mode={role === 'REVIEWER' ? 'analytics' : undefined} />;
}
