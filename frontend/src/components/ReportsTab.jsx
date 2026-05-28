import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function ReportsTab() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:8000/api/hr/sessions')
      .then(res => setSessions(res.data.filter(s => s.status === 'completed')))
      .catch(console.error);
  }, []);

  const openDetail = async (id) => {
    try {
      const res = await axios.get(`http://localhost:8000/api/hr/session/${id}`);
      setSelectedSession(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  return (
    <>
      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">Completed Evaluations</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Role</th>
              <th>Status</th>
              <th>Overall Score</th>
              <th>Recommendation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              // Assuming report is populated in the backend, or we map it if available
              const score = s.report?.overall_score || s.jd_match_score || "N/A";
              const verdict = s.report?.verdict || (score > 80 ? "Hire" : "Review");
              
              return (
                <tr key={s.id}>
                  <td>
                    <div className="cell-primary">{s.candidate_name}</div>
                    <div className="cell-sub">{s.detected_level}</div>
                  </td>
                  <td>{s.role}</td>
                  <td><span className="badge badge-green">Completed</span></td>
                  <td><strong style={{ color: 'var(--text-main)' }}>{score}{score !== "N/A" && typeof score === 'number' && score <= 10 ? "/10" : score > 10 ? "%" : ""}</strong></td>
                  <td><span className={`badge ${verdict.toLowerCase().includes('hire') ? 'badge-blue' : 'badge-amber'}`}>{verdict}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openDetail(s.id)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            
            {/* Demo Entry */}
            {sessions.length === 0 && (
              <tr>
                <td>
                  <div className="cell-primary">John Doe (Demo)</div>
                  <div className="cell-sub">Intermediate</div>
                </td>
                <td>Software Engineer</td>
                <td><span className="badge badge-green">Completed</span></td>
                <td><strong style={{ color: 'var(--text-main)' }}>8.5/10</strong></td>
                <td><span className="badge badge-blue">Strong Hire</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => setSelectedSession({
                        session: { candidate_name: "John Doe (Demo)", role: "Software Engineer", detected_level: "Intermediate" },
                        report: { overall_score: 8.5, technical_avg: 8.0, clarity_avg: 9.0, problem_solving_avg: 8.5, verdict: "Strong Hire", executive_summary: "John demonstrated solid understanding of core principles. He effectively broke down complex problems but struggled slightly with advanced architectural patterns. Overall, a strong fit for a mid-level role." },
                        answers: [
                          { question_text: "Can you explain how you handle state management in React?", answer_text: "I typically use Context API for global state and local state hooks for component level. I've also used Redux for larger apps where state logic is complex.", overall_score: 9.0, evaluation_note: "Clear and accurate." },
                          { question_text: "What happens when you type a URL into a browser?", answer_text: "The browser checks cache, then DNS resolution happens, then a TCP connection is established, and HTTP request is sent...", overall_score: 8.0, evaluation_note: "Good overview, missed some lower-level details." }
                        ]
                      })} 
                      style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      View
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-out Panel */}
      <div className={`detail-overlay ${selectedSession ? 'show' : ''}`} onClick={() => setSelectedSession(null)}></div>
      <div className={`detail-panel ${selectedSession ? 'show' : ''}`} style={{ paddingBottom: '40px' }}>
        <div className="detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>{selectedSession?.session?.candidate_name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-sub)' }}>{selectedSession?.session?.role} · {selectedSession?.session?.detected_level}</div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <button onClick={handleDownloadPDF} style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📄 Download PDF
            </button>
            <button className="close-btn" onClick={() => setSelectedSession(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
          </div>
        </div>
        <div className="detail-body">
          {selectedSession && selectedSession.report && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>Performance Report</h3>
                <span className={`badge ${selectedSession.report.verdict?.toLowerCase().includes('hire') ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: '14px', padding: '6px 12px' }}>
                  Recommendation: {selectedSession.report.verdict}
                </span>
              </div>

              <div className="score-breakdown" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                <div className="sd-card" style={{ background: 'var(--bg-main)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div className="sd-num" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{selectedSession.report.overall_score}</div>
                  <div className="sd-label" style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '5px' }}>Overall Score</div>
                </div>
                <div className="sd-card" style={{ background: 'var(--bg-main)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div className="sd-num" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedSession.report.technical_avg}</div>
                  <div className="sd-label" style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '5px' }}>Technical</div>
                </div>
                <div className="sd-card" style={{ background: 'var(--bg-main)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div className="sd-num" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedSession.report.clarity_avg}</div>
                  <div className="sd-label" style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '5px' }}>Clarity</div>
                </div>
                <div className="sd-card" style={{ background: 'var(--bg-main)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div className="sd-num" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedSession.report.problem_solving_avg || "N/A"}</div>
                  <div className="sd-label" style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '5px' }}>Problem Solving</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg2)', padding: '20px', borderRadius: '8px', marginTop: '16px', border: '1px solid var(--border)' }}>
                <h4 style={{ color: 'var(--accent)', margin: '0 0 10px 0' }}>Executive Summary</h4>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)', margin: 0 }}>{selectedSession.report.executive_summary}</p>
              </div>
              
              <h4 style={{ marginTop: '30px', marginBottom: '15px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Live Session Transcript</h4>
              <div className="transcript-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {selectedSession.answers?.map((ans, i) => (
                  <div key={i} style={{ fontSize: '14px' }}>
                    <div style={{ color: 'var(--accent)', marginBottom: '8px', fontWeight: 500 }}>
                      <strong>AI Interviewer:</strong> {ans.question_text}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-main)', marginBottom: '10px', lineHeight: 1.5 }}>
                        <strong>{selectedSession.session.candidate_name}:</strong> {ans.answer_text}
                      </div>
                      <div style={{ display: 'flex', gap: '15px', fontSize: '12px', color: 'var(--text-sub)', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                        <span className="badge badge-blue">Score: {ans.overall_score}/10</span>
                        <span><strong>Note:</strong> {ans.evaluation_note}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
