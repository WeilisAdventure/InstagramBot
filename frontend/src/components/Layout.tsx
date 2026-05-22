import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useNewMessageNotifications } from '../hooks/useNewMessageNotifications';

export default function Layout() {
  // Drives new-message notifications globally so they fire on every route,
  // not only while the operator is viewing /conversations.
  useNewMessageNotifications();
  return (
    <div className="app-shell" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Sidebar />
      <main className="main-content" style={{ height: '100%', overflow: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
}
