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
      <div className="topbar">
        <div>
          <div className="topbar-title">{title}</div>
          <div className="topbar-sub">{sub}</div>
        </div>
      </div>
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
  return (
    <Router>
      <Routes>
        {/* Candidate route */}
        <Route path="/candidate" element={<Candidate />} />
        
        {/* HR Dashboard (Unprotected) */}
        <Route path="/*" element={
          <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <MainLayout />
          </div>
        } />
      </Routes>
    </Router>
  );
}

export default App;
