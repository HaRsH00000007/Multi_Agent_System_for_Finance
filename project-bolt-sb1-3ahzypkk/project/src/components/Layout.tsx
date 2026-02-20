import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { Database, BarChart3, MessageSquare, CircleDot } from 'lucide-react';

export default function Layout() {
  const { hasSession, sessionData, backendOnline } = useSession();

  const navItems = [
    { to: '/', label: 'Reconcile', icon: Database },
    { to: '/visualize', label: 'Visualize', icon: BarChart3 },
    { to: '/chat', label: 'ZenChat', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/50">
                  <span className="text-white font-bold text-lg">Z</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Zenalyst</h1>
                  <p className="text-xs text-slate-400">Deterministic AI Workforce</p>
                </div>
              </div>

              <div className="hidden md:flex space-x-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="font-medium">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {!backendOnline && (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30">
                  <CircleDot className="w-3 h-3 text-red-400 animate-pulse" />
                  <span className="text-xs text-red-400 font-medium">Backend Offline</span>
                </div>
              )}

              {backendOnline && hasSession && sessionData && (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30">
                  <CircleDot className="w-3 h-3 text-green-400 animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-xs text-green-400 font-medium">Session Active</span>
                    <span className="text-xs text-slate-400">{sessionData.filename}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
