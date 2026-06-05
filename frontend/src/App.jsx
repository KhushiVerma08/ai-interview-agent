import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import DashboardTab from './components/DashboardTab';
import SessionsTab from './components/SessionsTab';
import ReportsTab from './components/ReportsTab';
import Candidate from './components/Candidate';
import Login from './components/Login';
import { supabase } from './supabaseClient';
import './index.css';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navs = [
    { path: '/', label: 'Overview', icon: '📊' },
    { path: '/sessions', label: 'Sessions', icon: '🎙️' },
    { path: '/reports', label: 'Reports', icon: '📑' },
  ];

  return (
    <nav className="sidebar">
      <div className="sb-logo">
        <div className="orb">🤖</div>
        <div><div className="brand">InterviewAI</div><div className="ver">HR Portal (React)</div></div>
      </div>
      <div className="sb-nav">
        <div className="nav-section">Dashboard</div>
        {navs.map(n => (
          <div
            key={n.path}
            className={`nav-item ${location.pathname === n.path ? 'active' : ''}`}
            onClick={() => navigate(n.path)}
          >
            <div className="ico">{n.icon}</div> {n.label}
          </div>
        ))}
      </div>
      <div className="sb-footer">
        <div><span className="status-dot"></span> System Online</div>
        <div style={{ marginTop: '15px', cursor: 'pointer', color: 'var(--accent2)', fontSize: '13px' }} onClick={() => supabase.auth.signOut()}>
          Sign Out
        </div>
      </div>
    </nav>
  );
}

function MainLayout() {
  const location = useLocation();
  const titles = {
    '/': { title: 'Dashboard', sub: 'Create and manage AI interviews' },
    '/sessions': { title: 'Active Sessions', sub: 'Monitor ongoing and scheduled interviews' },
    '/reports': { title: 'Evaluation Reports', sub: 'Review final AI scoring and verdicts' }
  };
  const { title, sub } = titles[location.pathname] || titles['/'];

  return (
    <div className="main">
      <header className="hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>{title}</h2>
          <div style={{color: 'var(--text-sec)', fontSize: '14px', marginTop: '5px'}}>{sub}</div>
        </div>
        <button 
          onClick={() => supabase.auth.signOut()} 
          style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-sec)', cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </header>
      <div className="content">
        <Routes>
          <Route path="/" element={<DashboardTab />} />
          <Route path="/sessions" element={<SessionsTab />} />
          <Route path="/reports" element={<ReportsTab />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Synchronously ensure axios has the token BEFORE children mount
  if (session) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  return (
    <Router>
      <Routes>
        {/* Candidate route (Public) */}
        <Route path="/candidate" element={<Candidate />} />
        
        {/* HR Dashboard (Protected) */}
        <Route path="/*" element={
          !session ? (
            <Login onLogin={setSession} />
          ) : (
            <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
              <Sidebar />
              <MainLayout />
            </div>
          )
        } />
      </Routes>
    </Router>
  );
}

export default App;
