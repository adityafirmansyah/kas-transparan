import type { ReactElement, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PublicPage from "./pages/PublicPage";
import { getSession } from "./api";
import "./App.css";

interface ProtectedRouteProps {
  children: ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps): ReactElement {
  const { token } = getSession();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
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
