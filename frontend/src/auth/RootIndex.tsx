import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Signed-in users land on the Dashboard; guests land on the public Products view. */
export default function RootIndex() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/products'} replace />;
}
