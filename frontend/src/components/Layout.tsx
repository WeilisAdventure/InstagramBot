import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="app-shell" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Sidebar />
      <main className="main-content" style={{ height: '100%', overflow: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
}
