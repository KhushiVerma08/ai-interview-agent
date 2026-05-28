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

  useEffect(() => {
    if (!sessionId) return;
    axios.get(`http://localhost:8000/api/interview/session/${sessionId}`)
      .then(res => setSession(res.data.session))
      .catch(console.error);
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

  if (!session) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading session...</div>;
  if (status === "completed") return <div style={{ padding: '40px', textAlign: 'center' }}><h2>Interview Completed</h2><p>Thank you for your time!</p></div>;

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', background: 'var(--card)', borderRadius: '12px' }}>
      <h2 style={{ marginBottom: '20px' }}>AI Interview: {session.role}</h2>
      
      {status === "waiting" ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ marginBottom: '20px' }}>Welcome, {session.candidateName}! Are you ready to begin your interview?</p>
          <button className="btn btn-primary" onClick={handleStart} disabled={loading}>Start Interview</button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '8px' }}>Question {currentQuestion?.number}</div>
            <div style={{ fontSize: '18px' }}>{currentQuestion?.text}</div>
          </div>
          
          <textarea 
            style={{ width: '100%', height: '150px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', color: 'var(--text)', fontSize: '14px', marginBottom: '20px' }}
            placeholder="Type your answer here..."
            value={answerText}
            onChange={e => setAnswerText(e.target.value)}
          />
          
          <div style={{ textAlign: 'right' }}>
            <button className="btn btn-primary" onClick={handleAnswer} disabled={loading || !answerText.trim()}>
              {loading ? "Submitting..." : "Submit Answer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
