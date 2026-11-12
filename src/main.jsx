import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Full from './pages/Full';
import Cancel from './pages/Cancel';
import Checkin from './pages/Checkin';
import Admin from './pages/Admin';
import { configError } from './lib/supabase';
import './index.css';

function App() {
  if (configError) {
    return (
      <main className="page">
        <div className="card notice notice--error">
          <strong>Setup needed.</strong> {configError}
        </div>
      </main>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/full" element={<Full />} />
      <Route path="/cancel" element={<Cancel />} />
      <Route path="/checkin" element={<Checkin />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
