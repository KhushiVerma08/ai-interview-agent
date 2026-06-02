import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function SessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

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

  return (
    <div className="table-wrap" style={{ position: 'relative' }}>
      <div className="table-header">
        <div className="table-title">Active & Scheduled Sessions</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Role</th>
            <th>Level</th>
            <th>Scheduled Time</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => {
            const timeStr = s.created_at ? new Date(s.created_at + (s.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
            return (
              <tr key={s.id}>
                <td>
                  <div className="cell-primary">{s.candidate_name}</div>
                </td>
                <td>{s.role}</td>
                <td><div className="badge badge-blue">{s.detected_level}</div></td>
                <td>{timeStr}</td>
                <td><span className="badge badge-amber">{s.status}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => viewQuestions(s.id)} style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '12px' }}>
                      View Plan
                    </button>
                    <a href={`http://localhost:3000${s.interview_link}`} target="_blank" rel="noreferrer" style={{ background: 'var(--accent)', color: 'white', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px' }}>
                      Open Link
                    </a>
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
          <div style={{ background: 'var(--bg-main)', width: '600px', maxHeight: '80vh', borderRadius: '8px', overflowY: 'auto', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Generated Question Plan</h3>
              <button onClick={() => setSelectedSessionId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✖</button>
            </div>
            
            {loadingQuestions ? (
              <p>Loading questions...</p>
            ) : questions.length === 0 ? (
              <p>No questions found for this session.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {questions.map((q, idx) => (
                  <div key={q.id || idx} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong>Q{q.question_number}: {q.topic}</strong>
                      <span className="badge badge-blue">{q.question_type}</span>
                    </div>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-main)' }}>{q.question_text}</p>
                    <div style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'flex', gap: '10px' }}>
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
