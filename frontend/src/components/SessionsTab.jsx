import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function SessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [filterStatus, setFilterStatus] = useState('All');
  const [filterRole, setFilterRole] = useState('All');
  const [filterDate, setFilterDate] = useState('');
  const [filterSelectionStatus, setFilterSelectionStatus] = useState('All');

  useEffect(() => {
    axios.get('http://localhost:8000/api/hr/sessions')
      .then(res => setSessions(res.data))
      .catch(console.error);
  }, []);

  const viewQuestions = (id) => {
    setSelectedSessionId(id);
    setLoadingQuestions(true);
    axios.get(`http://localhost:8000/api/hr/session/${id}`)
      .then(res => {
        setQuestions(res.data.questions || []);
        setLoadingQuestions(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingQuestions(false);
      });
  };

  const uniqueRoles = ['All', ...new Set(sessions.map(s => s.role))];
  const uniqueStatuses = ['All', 'Scheduled', 'In_Progress', 'Completed', 'Incomplete'];
  const uniqueSelectionStatuses = ['All', 'Strongly Recommended', 'Recommended', 'Needs Improvement', 'Not Recommended', 'N/A'];

  const filteredSessions = sessions.filter(s => {
    let match = true;
    if (filterStatus !== 'All' && s.status.toLowerCase() !== filterStatus.toLowerCase()) match = false;
    if (filterRole !== 'All' && s.role !== filterRole) match = false;
    if (filterSelectionStatus !== 'All' && (s.selection_status || 'N/A') !== filterSelectionStatus) match = false;
    if (filterDate) {
      const timeToUse = s.scheduled_at || s.created_at;
      const hasTz = timeToUse ? (timeToUse.endsWith('Z') || timeToUse.includes('+')) : false;
      const dateStr = timeToUse ? (hasTz ? timeToUse : timeToUse + 'Z') : null;
      if (dateStr) {
        const d = new Date(dateStr);
        const sessionDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
        if (sessionDate !== filterDate) match = false;
      } else {
        match = false;
      }
    }
    return match;
  });

  return (
    <div className="table-wrap" style={{ position: 'relative' }}>
      <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="table-title">Active & Scheduled Sessions</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-main)', fontSize: '13px' }}>
            {uniqueStatuses.map(st => <option key={st} value={st}>{st === 'All' ? 'All Statuses' : st}</option>)}
          </select>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-main)', fontSize: '13px' }}>
            {uniqueRoles.map(r => <option key={r} value={r}>{r === 'All' ? 'All Roles' : r}</option>)}
          </select>
          <select value={filterSelectionStatus} onChange={e => setFilterSelectionStatus(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-main)', fontSize: '13px' }}>
            {uniqueSelectionStatuses.map(st => <option key={st} value={st}>{st === 'All' ? 'All Recommendations' : st}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-main)', colorScheme: 'dark', fontSize: '13px' }} />
          { (filterStatus !== 'All' || filterRole !== 'All' || filterSelectionStatus !== 'All' || filterDate) && (
            <button onClick={() => { setFilterStatus('All'); setFilterRole('All'); setFilterSelectionStatus('All'); setFilterDate(''); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px', padding: '0' }}>Clear</button>
          )}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Role</th>
            <th>Level</th>
            <th>Scheduled Time</th>
            <th>Status</th>
            <th>Selection Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredSessions.map(s => {
            const timeToUse = s.scheduled_at || s.created_at;
            const hasTz = timeToUse ? (timeToUse.endsWith('Z') || timeToUse.includes('+')) : false;
            const dateStr = timeToUse ? (hasTz ? timeToUse : timeToUse + 'Z') : null;
            const timeStr = dateStr ? new Date(dateStr).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
            return (
              <tr key={s.id}>
                <td>
                  <div className="cell-primary">{s.candidate_name}</div>
                </td>
                <td>{s.role}</td>
                <td><div className="badge badge-blue">{s.detected_level}</div></td>
                <td>{timeStr}</td>
                <td><span className="badge badge-amber">{s.status}</span></td>
                <td>{s.selection_status || "N/A"}</td>
                <td>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => viewQuestions(s.id)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '12px' }}>
                      View Plan
                    </button>
                    {s.status.toLowerCase() === 'completed' ? (
                      <button style={{ background: 'var(--accent)', color: 'white', padding: '4px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                        View Report
                      </button>
                    ) : s.status.toLowerCase() === 'incomplete' ? (
                      <button onClick={() => alert(`Incomplete Reason: ${s.failure_reason || "Unknown"}`)} style={{ background: 'var(--bg2)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        View Reason
                      </button>
                    ) : (
                      <a href={`http://localhost:3000${s.interview_link}`} target="_blank" rel="noreferrer" style={{ background: 'var(--accent)', color: 'white', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px' }}>
                        Open Link
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && (
            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>No active sessions</td></tr>
          )}
        </tbody>
      </table>

      {selectedSessionId && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', width: '600px', maxHeight: '80vh', borderRadius: '8px', overflowY: 'auto', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--text)' }}>Generated Question Plan</h3>
              <button onClick={() => setSelectedSessionId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text2)' }}>✖</button>
            </div>
            
            {loadingQuestions ? (
              <p style={{ color: 'var(--text)' }}>Loading questions...</p>
            ) : questions.length === 0 ? (
              <p style={{ color: 'var(--text)' }}>No questions found for this session.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {questions.map((q, idx) => (
                  <div key={q.id || idx} style={{ padding: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ color: 'var(--text)' }}>Q{q.question_number}: {q.topic}</strong>
                      <span className="badge badge-blue">{q.question_type}</span>
                    </div>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text)' }}>{q.question_text}</p>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '10px' }}>
                      <span>Target: {q.target_skill}</span>
                      <span>Depth: {q.depth}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
