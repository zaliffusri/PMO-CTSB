import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { canViewFinance, isHrCalendarOnly } from '../../lib/permissions.js';
import Dashboard from '../pages/Dashboard';
import Projects from '../pages/Projects';
import ProjectDetail from '../pages/ProjectDetail';
import Clients from '../pages/Clients';
import Team from '../pages/Team';
import Calendar from '../pages/Calendar';
import Gantt from '../pages/Gantt';
import Issues from '../pages/Issues';
import MyWork from '../pages/MyWork';
import Finance from '../pages/Finance';
import Reports from '../pages/Reports';
import Users from '../pages/Users';
import Account from '../pages/Account';
import History from '../pages/History';
import SettingsLayout from '../pages/settings/SettingsLayout';
import SettingsLocations from '../pages/settings/SettingsLocations';
import SettingsBranding from '../pages/settings/SettingsBranding';
import SettingsEmail from '../pages/settings/SettingsEmail';

export default function AppRoutes() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hrOnly = isHrCalendarOnly(user);

  if (hrOnly) {
    return (
      <Routes>
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:id" element={<ProjectDetail />} />
      <Route path="/clients" element={<Clients />} />
      <Route path="/team" element={<Team />} />
      <Route path="/users" element={isAdmin ? <Users /> : <Dashboard />} />
      <Route path="/history" element={isAdmin ? <History /> : <Dashboard />} />
      <Route path="/settings" element={isAdmin ? <SettingsLayout /> : <Dashboard />}>
        <Route index element={<Navigate to="/settings/locations" replace />} />
        <Route path="general" element={<Navigate to="/settings/locations" replace />} />
        <Route path="locations" element={<SettingsLocations />} />
        <Route path="branding" element={<SettingsBranding />} />
        <Route path="appearance" element={<Navigate to="/settings/branding" replace />} />
        <Route path="email" element={<SettingsEmail />} />
        <Route path="teams-calendar" element={<Navigate to="/settings/email" replace />} />
      </Route>
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/gantt" element={<Gantt />} />
      <Route path="/helpdesk" element={<Issues />} />
      <Route path="/my-work" element={<MyWork />} />
      <Route path="/finance" element={canViewFinance(user) ? <Finance /> : <Dashboard />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  );
}
