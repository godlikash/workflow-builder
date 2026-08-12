import { useState } from 'react';
import { useRouter } from 'next/router';
import { useSignInEmailPassword, useAuthenticationStatus } from '@nhost/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInEmailPassword, isLoading, isError, error } = useSignInEmailPassword();
  const { isAuthenticated } = useAuthenticationStatus();
  const router = useRouter();

  if (isAuthenticated) router.push('/');

  const onSubmit = async (e) => {
    e.preventDefault();
    await signInEmailPassword(email, password);
    router.push('/');
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
      <h2>Sign in</h2>
      <form onSubmit={onSubmit} className="card">
        <div style={{ marginBottom: 10 }}>
          <label>Email</label><br />
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>Password</label><br />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button type="submit" disabled={isLoading}>Sign in</button>
        {isError && <p style={{ color: '#f87171' }}>{error?.message}</p>}
      </form>
    </div>
  );
}
