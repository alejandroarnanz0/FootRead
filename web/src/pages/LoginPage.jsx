import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.jsx';
import Button from '../components/Button.jsx';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const isRegister = mode === 'register';
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      if (isRegister) await register(form.email, form.password, form.name || undefined);
      else await login(form.email, form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-intro">
        <p>Scouting y analítica de fútbol basada en datos.</p>
        <div className="auth-pitch" aria-hidden="true">
          <span className="auth-pitch-area auth-pitch-area-start" />
          <span className="auth-pitch-area auth-pitch-area-end" />
          <span className="auth-pitch-point auth-pitch-point-first" />
          <span className="auth-pitch-point auth-pitch-point-second" />
        </div>
      </div>
      <form id="auth-form" className="card auth-card" tabIndex={-1} onSubmit={submit}>
        <h1>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
        {location.state?.expired && !error && (
          <p className="muted">Tu sesión ha caducado. Vuelve a entrar.</p>
        )}

        {isRegister && (
          <label className="field">
            <span>Nombre</span>
            <input type="text" value={form.name} onChange={update('name')} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" required value={form.email} onChange={update('email')} autoComplete="email" />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={update('password')}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </label>

        {error && <p className="field-error" role="alert">{error}</p>}

        <Button type="submit" variant="primary" disabled={sending}>
          {sending ? 'Enviando…' : isRegister ? 'Crear cuenta' : 'Entrar'}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setMode(isRegister ? 'login' : 'register');
            setError(null);
          }}
        >
          {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </Button>
      </form>
    </div>
  );
}
