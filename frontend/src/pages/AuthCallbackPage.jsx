import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function AuthCallbackPage() {
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against double-invoke in React StrictMode dev
    ran.current = true;

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token');

    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    completeLogin(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login', { replace: true }));
  }, [completeLogin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Signing you in…</p>
    </div>
  );
}
