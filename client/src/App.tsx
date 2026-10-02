import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { Layout, RequirePermission } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { StaffPage } from './pages/StaffPage';
import { ClassesPage } from './pages/ClassesPage';
import { SchedulePage } from './pages/SchedulePage';
import { ReservationsPage } from './pages/ReservationsPage';
import { TrainingPage } from './pages/TrainingPage';
import { TherapyPage } from './pages/TherapyPage';
import { CheckInsPage } from './pages/CheckInsPage';
import { FacilitiesPage } from './pages/FacilitiesPage';
import { PlansPage } from './pages/PlansPage';
import { UsersPage } from './pages/UsersPage';

// The dashboard pulls in the charting library, so it loads on demand.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

const guarded = (permission: string, page: React.ReactNode) => (
  <RequirePermission permission={permission}>{page}</RequirePermission>
);

export function App() {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <p className="loading" role="status">
        Loading…
      </p>
    );
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={guarded(
            'dashboard:read',
            <Suspense fallback={<p className="loading">Loading dashboard…</p>}>
              <DashboardPage />
            </Suspense>
          )}
        />
        <Route path="members" element={guarded('members:read', <MembersPage />)} />
        <Route path="checkins" element={guarded('checkins:read', <CheckInsPage />)} />
        <Route path="schedule" element={guarded('classes:read', <SchedulePage />)} />
        <Route path="reservations" element={guarded('reservations:read', <ReservationsPage />)} />
        <Route path="training" element={guarded('training:read', <TrainingPage />)} />
        <Route path="therapy" element={guarded('therapy:read', <TherapyPage />)} />
        <Route path="classes" element={guarded('classes:read', <ClassesPage />)} />
        <Route path="staff" element={guarded('staff:read', <StaffPage />)} />
        <Route path="facilities" element={guarded('catalog:read', <FacilitiesPage />)} />
        <Route path="plans" element={guarded('catalog:read', <PlansPage />)} />
        <Route path="users" element={guarded('users:manage', <UsersPage />)} />
        <Route
          path="*"
          element={
            <div className="empty-state">
              <h1>Page not found</h1>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
