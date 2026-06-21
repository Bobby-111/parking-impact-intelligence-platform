import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, UserCog, Bot, Network } from 'lucide-react';
import CityCommandCenter from './pages/CityCommandCenter.tsx';
import SpatialIntelligence from './pages/SpatialIntelligence.tsx';
import EnforcementOptimizer from './pages/EnforcementOptimizer.tsx';
import AICopilot from './pages/AICopilot.tsx';
import Architecture from './pages/Architecture.tsx';

const Sidebar = () => {
  const location = useLocation();
  const navItems = [
    { path: '/', name: 'Command Center', icon: <LayoutDashboard size={20} /> },
    { path: '/spatial', name: 'Spatial Intelligence', icon: <Map size={20} /> },
    { path: '/optimizer', name: 'Resource Simulator', icon: <UserCog size={20} /> },
    { path: '/copilot', name: 'AI Copilot', icon: <Bot size={20} /> },
    { path: '/architecture', name: 'System Architecture', icon: <Network size={20} /> }
  ];

  return (
    <div className="w-64 bg-slate-950 border-r border-white/5 flex flex-col h-screen">
      <div className="p-6">
        <h1 className="font-mono font-bold text-xl tracking-widest text-white">
          <span className="text-red-500">P</span>.I.I.P.
        </h1>
        <p className="text-xs text-slate-500 tracking-widest mt-1">OPERATIONS</p>
      </div>
      
      <nav className="flex-1 mt-6">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}>
              <div className={`flex items-center px-6 py-4 cursor-pointer border-l-2 transition-colors ${
                isActive ? 'border-sky-500 bg-slate-900/50 text-sky-400' : 'border-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}>
                {item.icon}
                <span className="ml-4 font-semibold text-sm">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-6 text-xs font-mono text-slate-600 space-y-1 tracking-widest">
        <div>SYS: ONLINE</div>
        <div>GRID: OPS-V1</div>
        <div>AI: ACTIVE</div>
      </div>
    </div>
  );
};

const AppContent = () => {
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const location = useLocation();

  // Reset presentation mode on page transitions
  useEffect(() => {
    setPresentationMode(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-background overflow-hidden text-slate-200">
      {!presentationMode && <Sidebar />}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-background to-background -z-10" />
        <Routes>
          <Route path="/" element={<CityCommandCenter presentationMode={presentationMode} setPresentationMode={setPresentationMode} />} />
          <Route path="/spatial" element={<SpatialIntelligence />} />
          <Route path="/optimizer" element={<EnforcementOptimizer />} />
          <Route path="/copilot" element={<AICopilot />} />
          <Route path="/architecture" element={<Architecture />} />
        </Routes>
      </main>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
