import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Rules from './pages/Rules';
import Simulate from './pages/Simulate';
import Conversations from './pages/Conversations';
import ChatView from './pages/ChatView';
import Knowledge from './pages/Knowledge';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/simulate" element={<Simulate />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/conversations/:id" element={<ChatView />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
