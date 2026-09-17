import { useEffect, useState } from 'react';

type HealthResponse = {
  status: 'ok' | 'degraded';
  checks: Record<string, 'ok' | 'error'>;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | 'loading' | 'unreachable'>('loading');

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => setHealth('unreachable'));
  }, []);

  return (
    <main>
      <h1>NeuraBid</h1>
      <p>Foundation checkpoint — bidding UI is not built yet.</p>
      <h2>Backend connectivity</h2>
      {health === 'loading' && <p>Checking backend...</p>}
      {health === 'unreachable' && (
        <p role="alert">Backend unreachable at /health (is `npm run dev:backend` running?)</p>
      )}
      {typeof health === 'object' && (
        <ul>
          <li>Overall: {health.status}</li>
          {Object.entries(health.checks).map(([name, status]) => (
            <li key={name}>
              {name}: {status}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default App;
