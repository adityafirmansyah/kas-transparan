import { useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../api";
import WargaTab from "../components/WargaTab";
import IuranTab from "../components/IuranTab";
import TagihanTab from "../components/TagihanTab";
import KasTab from "../components/KasTab";
import { useState } from "react";

const TABS = ["Warga", "Iuran", "Tagihan", "Kas"];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { role } = getSession();
  const [tab, setTab] = useState("Warga");

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>kas-transparan &mdash; Dashboard</h1>
        <div>
          <span className="role-badge">{role}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {tab === "Warga" && <WargaTab />}
        {tab === "Iuran" && <IuranTab />}
        {tab === "Tagihan" && <TagihanTab />}
        {tab === "Kas" && <KasTab />}
      </main>
    </div>
  );
}
