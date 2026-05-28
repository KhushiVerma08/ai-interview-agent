import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function DashboardTab() {
  const [jdFile, setJdFile] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [tempFiles, setTempFiles] = useState(null);
  const [stats, setStats] = useState({ total: 0, inProgress: 0, completed: 0, scheduled: 0, failed: 0, cancelled: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch real stats
    axios.get('http://localhost:8000/api/hr/sessions')
      .then(res => {
        const sessions = res.data || [];
        setStats({
          total: sessions.length,
          inProgress: sessions.filter(s => s.status?.toLowerCase() === 'in_progress').length,
          completed: sessions.filter(s => s.status?.toLowerCase() === 'completed').length,
          scheduled: sessions.filter(s => s.status?.toLowerCase() === 'scheduled').length,
          failed: sessions.filter(s => s.status?.toLowerCase() === 'failed').length,
          cancelled: sessions.filter(s => s.status?.toLowerCase() === 'cancelled').length,
        });
      })
      .catch(console.error);

    // Restore analysis from session storage if it exists
    const savedAnalysis = sessionStorage.getItem('hr_analysis');
    const savedTempFiles = sessionStorage.getItem('hr_tempFiles');
    if (savedAnalysis) setAnalysis(JSON.parse(savedAnalysis));
    if (savedTempFiles) setTempFiles(JSON.parse(savedTempFiles));
  }, []);

  const handleJdChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("JD File size exceeds 10MB limit.");
        setJdFile(null);
      } else {
        setJdFile(file);
      }
    }
  };

  const handleResumeChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Resume File size exceeds 5MB limit.");
        setResumeFile(null);
      } else {
        setResumeFile(file);
      }
    }
  };

  const removeJd = (e) => {
    e.stopPropagation();
    setJdFile(null);
  };

  const removeResume = (e) => {
    e.stopPropagation();
    setResumeFile(null);
  };

  const handleAnalyse = async () => {
    if (!jdFile || !resumeFile) return alert("Please upload both JD and Resume");
    setLoading(true);
    
    const formData = new FormData();
    formData.append('jd', jdFile);
    formData.append('resume', resumeFile);
    formData.append('role', 'Software Engineer');
    
    try {
      const res = await axios.post('http://localhost:8000/api/analyse', formData);
      setAnalysis(res.data.analysis);
      setTempFiles(res.data.tempFiles);
      sessionStorage.setItem('hr_analysis', JSON.stringify(res.data.analysis));
      sessionStorage.setItem('hr_tempFiles', JSON.stringify(res.data.tempFiles));
    } catch (err) {
      alert("Analysis failed: " + err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  const handleSchedule = async () => {
    if (!analysis) return;
    setLoading(true);
    try {
      await axios.post('http://localhost:8000/api/schedule', {
        analysis,
        role: 'Software Engineer',
        tempFiles
      });
      // Clear session storage once scheduled
      sessionStorage.removeItem('hr_analysis');
      sessionStorage.removeItem('hr_tempFiles');
      navigate('/sessions');
    } catch (err) {
      alert("Scheduling failed");
    }
    setLoading(false);
  };

  const handleReset = () => {
    setAnalysis(null);
    setTempFiles(null);
    setJdFile(null);
    setResumeFile(null);
    sessionStorage.removeItem('hr_analysis');
    sessionStorage.removeItem('hr_tempFiles');
  };

  return (
    <div>
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '15px', marginBottom: '30px' }}>
        <div className="stat-card" style={{ background: 'var(--bg2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat-num" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)' }}>{stats.total}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(52, 211, 153, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(52, 211, 153, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat-num" style={{ fontSize: '28px', fontWeight: 800, color: '#34d399' }}>{stats.completed}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#34d399', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(91, 124, 250, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(91, 124, 250, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat-num" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent)' }}>{stats.scheduled}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scheduled</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(168, 85, 247, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat-num" style={{ fontSize: '28px', fontWeight: 800, color: '#a855f7' }}>{stats.inProgress}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#a855f7', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>In Progress</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat-num" style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>{stats.failed}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Failed</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(255, 171, 0, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255, 171, 0, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="stat-num" style={{ fontSize: '28px', fontWeight: 800, color: '#ffab00' }}>{stats.cancelled}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#ffab00', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cancelled</div>
        </div>
      </div>

      {!analysis && (
        <div className="form-card full" style={{ marginBottom: '20px' }}>
          <div className="form-label">New Interview Setup</div>
          <div className="form-grid">
            <div className="drop-zone" onClick={() => !jdFile && document.getElementById('jd').click()} style={{ cursor: jdFile ? 'default' : 'pointer' }}>
              <input id="jd" type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleJdChange} />
              <div className="drop-icon">📄</div>
              <div className="drop-title">
                {jdFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{jdFile.name}</span>
                    <button onClick={removeJd} style={{ background: 'var(--border)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', color: 'var(--text-main)', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : 'Upload JD (Max 10MB)'}
              </div>
            </div>
            <div className="drop-zone" onClick={() => !resumeFile && document.getElementById('res').click()} style={{ cursor: resumeFile ? 'default' : 'pointer' }}>
              <input id="res" type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleResumeChange} />
              <div className="drop-icon">📎</div>
              <div className="drop-title">
                {resumeFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{resumeFile.name}</span>
                    <button onClick={removeResume} style={{ background: 'var(--border)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', color: 'var(--text-main)', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : 'Upload Resume (Max 5MB)'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <button className="btn btn-primary" disabled={!jdFile || !resumeFile || loading} onClick={handleAnalyse}>
              {loading ? "Analysing..." : "🔍 Analyse Documents"}
            </button>
          </div>
        </div>
      )}

      {analysis && (
        <div className="analysis-panel show" style={{ padding: '20px', background: 'var(--bg2)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: '0 0 5px 0', color: 'var(--text-main)' }}>{analysis.candidateName}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{analysis.detectedLevel}</span>
                <span style={{ fontSize: '14px', color: 'var(--text-sub)' }}>{analysis.levelReason || `${analysis.yearsExperience} years experience`}</span>
              </div>
            </div>
            <div style={{ background: 'rgba(91,124,250,0.1)', padding: '10px 15px', borderRadius: '8px', color: 'var(--accent)', fontWeight: 600 }}>
              Match Score: {analysis.gapAnalysis?.matchScore || analysis.jdMatchScore || 0}%
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={{ background: 'var(--bg-main)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>Skills Detected</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(analysis.resumeInfo?.skills || analysis.keySkills || []).map(skill => (
                  <span key={skill} className="badge" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>{skill}</span>
                ))}
              </div>
            </div>
            
            <div style={{ background: 'rgba(255, 171, 0, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255, 171, 0, 0.2)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#ffab00' }}>Skills to Probe (Missing/Weak)</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(analysis.gapAnalysis?.missingSkills || analysis.missingSkills || []).map(skill => (
                  <span key={skill} className="badge badge-amber">{skill}</span>
                ))}
                {(analysis.gapAnalysis?.weakAreas || []).map(skill => (
                  <span key={skill} className="badge badge-amber">{skill}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
            <button className="btn" onClick={handleReset} disabled={loading} style={{ padding: '12px 24px', fontSize: '16px', background: 'var(--bg3)', color: 'var(--text-main)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              ↺ Reset
            </button>
            <button className="btn btn-success" onClick={handleSchedule} disabled={loading} style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer' }}>
              📅 Start Interview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
