import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import LandingPage from '../pages/LandingPage';

/** Signed-in users land on the Dashboard; guests see the public landing page. */
export default function RootIndex() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}
