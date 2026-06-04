import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // login, register, forgot
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session) onLogin(data.session);
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Registration successful! You can now log in.');
        setMode('login');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMsg('Password reset link sent to your email.');
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-orb">HR</div>
        <h2 className="login-title">
          {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'}
        </h2>
        <p className="login-sub">
          {mode === 'login' ? 'Enter your credentials to access the AI Interview Dashboard.' : 
           mode === 'register' ? 'Register a new HR account.' : 
           'Enter your email to receive a password reset link.'}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email Address"
            className="login-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder="Password"
              className="login-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          )}

          {error && <div className="login-error" style={{ color: 'var(--accent3)', marginBottom: '10px', fontSize: '13px' }}>{error}</div>}
          {msg && <div style={{ color: 'var(--accent2)', marginBottom: '10px', fontSize: '13px' }}>{msg}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Processing...' : mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text3)' }}>
          {mode === 'login' && (
            <>
              <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setMode('register')}>Create an account</span>
              {' | '}
              <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setMode('forgot')}>Forgot password?</span>
            </>
          )}
          {(mode === 'register' || mode === 'forgot') && (
            <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setMode('login')}>Back to Login</span>
          )}
        </div>
      </div>
    </div>
  );
}
