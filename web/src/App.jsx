import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RegulatoryStandards from './pages/RegulatoryStandards';
import CaseStudies from './pages/CaseStudies';
import Documentation from './pages/Documentation';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewScan from './pages/NewScan';
import Inspections from './pages/Inspections';
import InspectionDetail from './pages/InspectionDetail';
import Reports from './pages/Reports';
import Complaints from './pages/Complaints';
import Settings from './pages/Settings';
import ReviewerDashboard from './pages/ReviewerDashboard';
import ControllerDashboard from './pages/ControllerDashboard';
import NotFound from './pages/NotFound';

// Decodes the JWT payload without verification (signature is validated
// server-side) — enough to know expiry and role for routing decisions.
function decodeTokenPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function getTokenClaims() {
  const token = localStorage.getItem('almac_token');
  if (!token) return null;
  const claims = decodeTokenPayload(token);
  if (!claims) return null;
  // Expired tokens are treated as unauthenticated.
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

function ProtectedRoute({ children, roles }) {
  const location = useLocation();
  const claims = getTokenClaims();

  if (!claims) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(String(claims.role || '').toUpperCase())) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function PublicAuthRoute({ children }) {
  const claims = getTokenClaims();
  if (claims) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/standards" element={<RegulatoryStandards />} />
        <Route path="/case-studies" element={<CaseStudies />} />
        <Route path="/docs" element={<Documentation />} />
        <Route
          path="/login"
          element={
            <PublicAuthRoute>
              <Login />
            </PublicAuthRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicAuthRoute>
              <Register />
            </PublicAuthRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/scan"
          element={
            <ProtectedRoute>
              <NewScan />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/inspections"
          element={
            <ProtectedRoute>
              <Inspections />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/escalation-hub"
          element={
            <ProtectedRoute roles={['CONTROLLER']}>
              <ControllerDashboard mode="hub" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/validation-queue"
          element={
            <ProtectedRoute roles={['REVIEWER']}>
              <ReviewerDashboard mode="queue" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/inspections/:id"
          element={
            <ProtectedRoute>
              <InspectionDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/reports"
          element={
            <ProtectedRoute roles={['INSPECTOR', 'REVIEWER', 'CONTROLLER', 'DIRECTOR']}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/complaints"
          element={
            <ProtectedRoute>
              <Complaints />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
