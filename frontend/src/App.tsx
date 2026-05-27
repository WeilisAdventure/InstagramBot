import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Rules from './pages/Rules';
import Conversations from './pages/Conversations';
import Comments from './pages/Comments';
import Settings from './pages/Settings';
import { isLoggedIn } from './api/client';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rules" element={<Rules />} />
          {/* Instagram inbox (legacy URL kept — Conversations reads the
              channel from the URL, defaulting to 'instagram' when absent). */}
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/comments" element={<Comments />} />
          {/* Per-channel inboxes. The path segment is read by Conversations
              via useParams.channel. Adding a new channel = adding one route. */}
          <Route path="/:channel/conversations" element={<Conversations />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
