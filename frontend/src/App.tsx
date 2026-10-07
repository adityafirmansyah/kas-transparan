import type { ReactElement, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PublicPage from "./pages/PublicPage";
import { getSession } from "./api";
import "./App.css";

interface RouteProps {
  children: ReactNode;
}

function ProtectedRoute({ children }: RouteProps): ReactElement {
  const { token } = getSession();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function GuestRoute({ children }: RouteProps): ReactElement {
  const { token } = getSession();
  return token ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function RootRedirect(): ReactElement {
  const { token } = getSession();
  return <Navigate to={token ? "/dashboard" : "/login"} replace />;
}

function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="/public/:slug" element={<PublicPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
