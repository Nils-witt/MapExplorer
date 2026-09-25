import { Navigate, BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { DataProviders } from './context/DataProviders';
import { MapView } from './components/MapView';
import { RequireAuth } from './components/RequireAuth';
import LoginPage from './pages/LoginPage.tsx';
import LoginCallbackPage from './pages/LoginCallbackPage.tsx';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path={'login'} element={<LoginPage />} />
          <Route path={'login/callback'} element={<LoginCallbackPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<DataProviders />}>
              <Route index element={<MapView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
