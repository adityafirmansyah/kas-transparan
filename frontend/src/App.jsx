import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PublicPage from "./pages/PublicPage";
import { getSession } from "./api";
import "./App.css";

function ProtectedRoute({ children }) {
  const { token } = getSession();
  return token ? children : <Navigate to="/login" replace />;
}

function App() {
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

export default App
