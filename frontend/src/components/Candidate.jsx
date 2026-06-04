import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

export default function Candidate() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [status, setStatus] = useState("waiting"); // waiting, active, completed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    axios.get(`http://localhost:8000/api/interview/session/${sessionId}`)
      .then(res => setSession(res.data.session))
      .catch(err => {
        if (err.response && err.response.status === 403) {
          setError("Meeting is no longer active");
        } else {
          setError("Failed to load session details.");
        }
      });
  }, [sessionId]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/interview/start', { sessionId, qNum: 1 });
      setCurrentQuestion(res.data.question);
      setStatus("active");
    } catch (err) {
      alert("Failed to start");
    }
    setLoading(false);
  };

  const handleAnswer = async () => {
    if (!answerText.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/interview/answer', {
        sessionId,
        qNum: currentQuestion.number,
        qText: currentQuestion.text,
        answerText
      });
      
      setAnswerText("");
      
      if (res.data.action === "complete") {
        setStatus("completed");
      } else {
        const nextQRes = await axios.post('http://localhost:8000/api/interview/start', { sessionId, qNum: currentQuestion.number + 1 });
        setCurrentQuestion(nextQRes.data.question);
      }
    } catch (err) {
      alert("Failed to submit answer");
    }
    setLoading(false);
  };

  if (error) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)' }}><div style={{ padding: '40px', textAlign: 'center', background: 'var(--card)', borderRadius: 'var(--r2)', boxShadow: '0 12px 40px rgba(0,0,0,0.08)', color: 'var(--accent3)' }}><h2 style={{fontSize: '24px', marginBottom: '10px'}}>Meeting Inactive</h2><p>{error}</p></div></div>;
  if (!session) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)' }}><div className="orb" style={{animation: 'pulse 1.5s infinite'}}>🤖</div></div>;
  if (status === "completed") return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)' }}><div style={{ padding: '50px', textAlign: 'center', background: 'var(--card)', borderRadius: 'var(--r2)', boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}><div style={{fontSize: '48px', marginBottom:'20px'}}>🎉</div><h2 style={{fontSize: '28px', color: 'var(--text)', marginBottom: '10px'}}>Interview Completed</h2><p style={{color: 'var(--text2)'}}>Thank you for your time, {session.candidateName}. You can now close this tab.</p></div></div>;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', fontFamily: 'var(--font)' }}>
      <div style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="orb" style={{width: '40px', height: '40px', fontSize: '20px', background: 'linear-gradient(135deg, var(--accent), var(--accent5))', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', boxShadow: '0 4px 12px rgba(59,130,246,0.3)'}}>🤖</div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)' }}>InterviewAI</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{session.role} Role</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)', padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', color: 'var(--text2)', border: '1px solid var(--border)' }}>
          Candidate: {session.candidateName}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '800px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(226,232,240,0.8)', borderRadius: '24px', padding: '40px', boxShadow: '0 12px 40px rgba(0,0,0,0.04)', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        {status === "waiting" ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 style={{ fontSize: '32px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', letterSpacing: '-0.5px' }}>Ready when you are.</h2>
            <p style={{ color: 'var(--text2)', fontSize: '16px', marginBottom: '32px', lineHeight: '1.6', maxWidth: '500px', margin: '0 auto 32px' }}>This is an AI-conducted interview for the <strong>{session.role}</strong> position. Ensure you are in a quiet place and take your time to answer thoroughly.</p>
            <button className="btn btn-primary" onClick={handleStart} disabled={loading} style={{ padding: '14px 32px', fontSize: '16px', borderRadius: '12px' }}>
              {loading ? "Preparing..." : "Begin Interview"}
            </button>
          </div>
        ) : (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>Question {currentQuestion?.number}</div>
              {loading && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />}
            </div>
            
            <h3 style={{ fontSize: '24px', fontWeight: '500', color: 'var(--text)', lineHeight: '1.5', marginBottom: '32px', letterSpacing: '-0.3px' }}>
              {currentQuestion?.text}
            </h3>
            
            <textarea 
              style={{ width: '100%', height: '180px', background: 'var(--bg3)', border: '1.5px solid var(--border)', borderRadius: '16px', padding: '20px', color: 'var(--text)', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px', resize: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}
              placeholder="Type your answer here in detail..."
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleAnswer} disabled={loading || !answerText.trim()} style={{ padding: '12px 28px', fontSize: '15px', borderRadius: '10px' }}>
                {loading ? "Analyzing..." : "Submit Answer"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.5; transform: scale(1); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
