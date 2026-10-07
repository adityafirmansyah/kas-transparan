import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, setSession } from "../api";
import type { TokenResponse } from "../types";

export default function LoginPage(): ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const resp = await api.post<TokenResponse>("/api/auth/login", { username, password });
      setSession(resp.data);
      navigate("/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Login gagal"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>kas-transparan</h1>
        <p className="subtitle">Login admin / bendahara / ketua</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Memproses..." : "Login"}
        </button>
        <p className="hint">
          Lihat transparansi kas tanpa login di <code>/public/&lt;slug-komunitas&gt;</code>
        </p>
      </form>
    </div>
  );
}
