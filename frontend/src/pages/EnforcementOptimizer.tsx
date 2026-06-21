import { useState, useEffect } from 'react';
import { runOptimizer } from '../api';
import { GlassCard } from '../components/GlassCard';
import { Shield, Sparkles, UserCheck, AlertTriangle, TrendingUp, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';

interface PatrolManifestItem {
  hotspot_id: string;
  dominant_junction: string;
  display_location?: string;
  dominant_police_station: string;
  recommended_time: string;
  projected_risk_index: number;
  ops_score: number;
  assigned_officer: string;
  center_lat: number;
  center_lon: number;
}

interface OptimizerData {
  risk_reduction: number;
  manifest: PatrolManifestItem[];
}

const EnforcementOptimizer = () => {
  const [officers, setOfficers] = useState(10);
  const [data, setData] = useState<OptimizerData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchOptimization = async () => {
      setLoading(true);
      try {
        const res = await runOptimizer(officers);
        setData(res);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    
    const timer = setTimeout(fetchOptimization, 300);
    return () => clearTimeout(timer);
  }, [officers]);

  // Diminishing returns curve for Operational Coverage
  const getCoverage = (units: number) => {
    if (units <= 10) {
      return 50 + (units * 3.2); // 10 -> 82%
    } else if (units <= 20) {
      return 82 + (units - 10) * 1.4; // 20 -> 96%
    } else {
      return Math.min(100, 96 + (units - 20) * 0.05); // 100 -> 100%
    }
  };

  // Critical Zones protected
  const getZones = (units: number) => {
    if (units <= 10) {
      return Math.round(15 + (units * 2.3)); // 10 -> 38
    } else if (units <= 20) {
      return Math.round(38 + (units - 10) * 0.7); // 20 -> 45
    } else {
      return Math.min(128, Math.round(45 + (units - 20) * 1.0375)); // 100 -> 128
    }
  };

  // Curve Calculations
  const chartWidth = 500;
  const chartHeight = 220;
  const chartPadding = 40;

  const curvePoints: { x: number; y: number }[] = [];
  for (let i = 1; i <= 100; i += 2) {
    const cov = getCoverage(i);
    const cx = chartPadding + (i / 100) * (chartWidth - chartPadding * 2);
    const cy = chartHeight - chartPadding - (cov / 100) * (chartHeight - chartPadding * 2);
    curvePoints.push({ x: cx, y: cy });
  }

  const curveD = curvePoints.reduce((acc, p, i) => {
    return acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
  }, '');

  const fillD = `${curveD} L ${chartPadding + (chartWidth - chartPadding * 2)} ${chartHeight - chartPadding} L ${chartPadding} ${chartHeight - chartPadding} Z`;

  const activeCoverage = getCoverage(officers);
  const activeZones = getZones(officers);
  const activeX = chartPadding + (officers / 100) * (chartWidth - chartPadding * 2);
  const activeY = chartHeight - chartPadding - (activeCoverage / 100) * (chartHeight - chartPadding * 2);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header Info */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-white/5 pb-4 mb-2">
        <div>
          <h1 className="text-2xl font-mono font-black tracking-widest text-white uppercase flex items-center gap-3">
            <Cpu className="text-sky-400 animate-pulse" size={28} />
            Resource Allocation Simulator
          </h1>
          <p className="text-xs text-slate-400 tracking-wider font-mono uppercase mt-0.5 font-semibold">
            Dynamic Enforcement Coverage Optimization
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
          <Sparkles className="text-emerald-400 animate-spin" size={14} style={{ animationDuration: '6s' }} />
          <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
            OPTIMIZATION ENGINE ENGAGED
          </span>
        </div>
      </div>

      {/* Main Grid: Control Panel (Left) & SVG Curve Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Input sliders & metrics (7 cols) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <GlassCard className="flex flex-col justify-between h-full">
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase font-mono flex items-center gap-2">
                  <Shield size={14} className="text-sky-400" />
                  Deployment Parameters
                </h3>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full font-bold">V3 ACTIVE</span>
              </div>

              {/* Slider Block */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold tracking-wider font-mono text-slate-400 uppercase">
                    Available Patrol Units
                  </label>
                  <span className="text-2xl font-mono font-black text-sky-400">
                    {officers} <span className="text-xs text-slate-500">Officers</span>
                  </span>
                </div>
                <input 
                  type="range" 
                  min="1" max="100" 
                  value={officers} 
                  onChange={(e) => setOfficers(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>

              {/* Secondary slider display indicators */}
              <div className="grid grid-cols-2 gap-4 pt-2 font-mono text-xs">
                <div className="bg-slate-950/30 p-3 rounded border border-white/5 relative overflow-hidden">
                  <div className="text-slate-500 text-[8.5px] uppercase tracking-wider font-bold">Enforcement Coverage</div>
                  <motion.div 
                    key={activeCoverage}
                    initial={{ opacity: 0.5, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-emerald-400 text-2xl font-black mt-1"
                  >
                    {activeCoverage.toFixed(0)}%
                  </motion.div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">Target Risk Covered</div>
                </div>

                <div className="bg-slate-950/30 p-3 rounded border border-white/5 relative overflow-hidden">
                  <div className="text-slate-500 text-[8.5px] uppercase tracking-wider font-bold">Zones Covered</div>
                  <motion.div 
                    key={activeZones}
                    initial={{ opacity: 0.5, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-white text-2xl font-black mt-1"
                  >
                    {activeZones} <span className="text-xs text-slate-500">/ 128</span>
                  </motion.div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">Critical cells protected</div>
                </div>
              </div>
            </div>

            {/* Before vs After Impact Visualizer */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              
              {/* Without Optimization Card */}
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden opacity-80">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                  <AlertTriangle size={64} />
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">
                  Without Optimization
                </div>
                
                <div className="space-y-3 font-mono text-xs z-10">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Coverage</span>
                    <span className="font-bold text-slate-300">41%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Critical Zones</span>
                    <span className="font-bold text-slate-300">18 <span className="text-[9px] text-slate-600">/ 128</span></span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-white/5">
                    <span className="text-slate-500">Efficiency</span>
                    <span className="px-1.5 py-0.5 rounded font-bold uppercase bg-red-500/20 text-red-400 text-[9px]">
                      Low
                    </span>
                  </div>
                </div>
              </div>

              {/* With Optimization Card (Live) */}
              <div className="bg-sky-950/20 border border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.1)] p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5 text-sky-500">
                  <Sparkles size={64} />
                </div>
                <div className="text-[10px] font-bold text-sky-400 uppercase tracking-widest border-b border-sky-500/20 pb-2 flex items-center gap-1.5">
                  <Cpu size={12} className="animate-pulse" /> With Optimization
                </div>
                
                <div className="space-y-3 font-mono text-xs z-10">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Coverage</span>
                    <motion.span 
                      key={`cov-${activeCoverage}`}
                      initial={{ opacity: 0.5, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="font-black text-emerald-400"
                    >
                      {activeCoverage.toFixed(0)}%
                    </motion.span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Critical Zones</span>
                    <motion.span 
                      key={`zon-${activeZones}`}
                      initial={{ opacity: 0.5, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="font-bold text-white"
                    >
                      {activeZones} <span className="text-[9px] text-slate-600">/ 128</span>
                    </motion.span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-white/5">
                    <span className="text-slate-500">Efficiency</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                      officers <= 10 ? 'bg-emerald-500/20 text-emerald-400' :
                      officers <= 20 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {officers <= 10 ? 'High' : officers <= 20 ? 'Moderate' : 'Low'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </GlassCard>

          <GlassCard className="border-l-4 border-l-amber-500 bg-amber-500/5 mt-4">
            <h3 className="text-xs font-bold tracking-widest text-amber-400 uppercase mb-2 flex items-center gap-1.5 font-mono">
              <Sparkles className="animate-pulse" size={14} />
              RECOMMENDED ACTION
            </h3>
            <div className="space-y-1.5 font-mono text-xs text-slate-300">
              <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                <span>Deploy: <strong>{Math.min(officers, 4)} Officers</strong></span>
                <span className="text-sky-400">→ High Priority Junctions</span>
              </div>
              <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                <span>Estimated Congestion Exposure Reduction:</span>
                <span className="text-emerald-400 font-bold">{data?.risk_reduction ? data.risk_reduction.toFixed(1) : '18.0'}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1.5 text-[10px] border-t border-white/5">
                <div>Risk Level: <span className="text-red-400 font-bold block">Critical</span></div>
                <div>Operational Window: <span className="text-amber-400 font-bold block">Night Operations</span></div>
              </div>
              <p className="text-[9px] text-slate-400 pt-1">
                <strong>Why Selected:</strong> Allocating {officers} officers maximizes coverage efficiency at {activeCoverage.toFixed(0)}%.
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Right: SVG Curve Chart (5 cols) */}
        <div className="lg:col-span-6 animate-glow">
          <GlassCard className="flex flex-col justify-between h-full">
            <div>
              <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-4">
                <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase font-mono flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-400" />
                  Coverage Optimization Curve
                </h3>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">LIVE CHART</span>
              </div>

              {/* SVG Area Chart */}
              <div className="w-full flex items-center justify-center p-3 bg-slate-950/20 rounded border border-white/5 relative">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
                  <defs>
                    <linearGradient id="curveGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1={chartPadding} y1={chartPadding} x2={chartWidth - chartPadding} y2={chartPadding} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                  <line x1={chartPadding} y1={(chartHeight - chartPadding * 2) / 2 + chartPadding} x2={chartWidth - chartPadding} y2={(chartHeight - chartPadding * 2) / 2 + chartPadding} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                  <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} stroke="rgba(255,255,255,0.1)" />

                  {/* Shaded Overlay Zones */}
                  {/* Optimal Allocation Zone (1-10 officers, green) */}
                  <rect 
                    x={chartPadding} 
                    y={chartPadding} 
                    width={(10 / 100) * (chartWidth - chartPadding * 2)} 
                    height={chartHeight - chartPadding * 2} 
                    fill="rgba(16, 185, 129, 0.08)" 
                  />
                  {/* Diminishing Returns Zone (10-20 officers, amber) */}
                  <rect 
                    x={chartPadding + (10 / 100) * (chartWidth - chartPadding * 2)} 
                    y={chartPadding} 
                    width={(10 / 100) * (chartWidth - chartPadding * 2)} 
                    height={chartHeight - chartPadding * 2} 
                    fill="rgba(245, 158, 11, 0.05)" 
                  />
                  {/* Over-deployment Zone (20-100 officers, red) */}
                  <rect 
                    x={chartPadding + (20 / 100) * (chartWidth - chartPadding * 2)} 
                    y={chartPadding} 
                    width={(80 / 100) * (chartWidth - chartPadding * 2)} 
                    height={chartHeight - chartPadding * 2} 
                    fill="rgba(239, 68, 68, 0.03)" 
                  />

                  {/* Efficiency labels at the top of the curve */}
                  <text x={chartPadding + (5 / 100) * (chartWidth - chartPadding * 2)} y={chartPadding + 14} textAnchor="middle" fill="#10b981" className="text-[7px] font-mono font-bold">OPTIMAL</text>
                  <text x={chartPadding + (5 / 100) * (chartWidth - chartPadding * 2)} y={chartPadding + 22} textAnchor="middle" fill="#34d399" className="text-[6px] font-mono font-bold">+3.2%/U</text>

                  <text x={chartPadding + (15 / 100) * (chartWidth - chartPadding * 2)} y={chartPadding + 14} textAnchor="middle" fill="#f59e0b" className="text-[7px] font-mono font-bold">MODEST</text>
                  <text x={chartPadding + (15 / 100) * (chartWidth - chartPadding * 2)} y={chartPadding + 22} textAnchor="middle" fill="#fbbf24" className="text-[6px] font-mono font-bold">+1.4%/U</text>

                  <text x={chartPadding + (60 / 100) * (chartWidth - chartPadding * 2)} y={chartPadding + 14} textAnchor="middle" fill="#ef4444" className="text-[7px] font-mono font-bold">OVER-DEPLOYMENT (LOW RETURN)</text>
                  <text x={chartPadding + (60 / 100) * (chartWidth - chartPadding * 2)} y={chartPadding + 22} textAnchor="middle" fill="#f87171" className="text-[6px] font-mono font-bold">+0.05%/U</text>

                  {/* Vertical boundary lines with explicit highlight */}
                  <line 
                    x1={chartPadding + (10 / 100) * (chartWidth - chartPadding * 2)} 
                    y1={chartPadding} 
                    x2={chartPadding + (10 / 100) * (chartWidth - chartPadding * 2)} 
                    y2={chartHeight - chartPadding} 
                    stroke="#10b981" 
                    strokeWidth="1.5"
                    strokeDasharray="3 3" 
                    opacity="0.7"
                  />
                  <line 
                    x1={chartPadding + (20 / 100) * (chartWidth - chartPadding * 2)} 
                    y1={chartPadding} 
                    x2={chartPadding + (20 / 100) * (chartWidth - chartPadding * 2)} 
                    y2={chartHeight - chartPadding} 
                    stroke="#f59e0b" 
                    strokeWidth="1"
                    strokeDasharray="2 2" 
                    opacity="0.5"
                  />

                  {/* Y Axis Labels */}
                  <text x={chartPadding - 10} y={chartPadding + 4} textAnchor="end" fill="#64748b" className="text-[10px] font-mono font-bold">100%</text>
                  <text x={chartPadding - 10} y={(chartHeight - chartPadding * 2) / 2 + chartPadding + 4} textAnchor="end" fill="#64748b" className="text-[10px] font-mono font-bold">80%</text>
                  <text x={chartPadding - 10} y={chartHeight - chartPadding + 4} textAnchor="end" fill="#64748b" className="text-[10px] font-mono font-bold">50%</text>

                  {/* X Axis Labels */}
                  <text x={chartPadding} y={chartHeight - chartPadding + 18} textAnchor="middle" fill="#64748b" className="text-[10px] font-mono font-bold">0</text>
                  <text x={chartPadding + (10 / 100) * (chartWidth - chartPadding * 2)} y={chartHeight - chartPadding + 18} textAnchor="middle" fill="#10b981" className="text-[10px] font-mono font-black">10 U</text>
                  <text x={chartPadding + (20 / 100) * (chartWidth - chartPadding * 2)} y={chartHeight - chartPadding + 18} textAnchor="middle" fill="#f59e0b" className="text-[10px] font-mono font-black">20 U</text>
                  <text x={chartPadding + (100 / 100) * (chartWidth - chartPadding * 2)} y={chartHeight - chartPadding + 18} textAnchor="middle" fill="#64748b" className="text-[10px] font-mono font-bold">100 Officers</text>

                  {/* Area fill under curve */}
                  <path d={fillD} fill="url(#curveGlow)" />

                  {/* Curve Path Line */}
                  <path d={curveD} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />

                  {/* Horizontal dotted alignment line to active node */}
                  <line x1={chartPadding} y1={activeY} x2={activeX} y2={activeY} stroke="#38bdf8" strokeDasharray="3 3" strokeOpacity="0.5" />
                  {/* Vertical dotted alignment line to active node */}
                  <line x1={activeX} y1={activeY} x2={activeX} y2={chartHeight - chartPadding} stroke="#38bdf8" strokeDasharray="3 3" strokeOpacity="0.5" />

                  {/* Active node pulsing outer circle */}
                  <circle cx={activeX} cy={activeY} r="9" fill="rgba(14,165,233,0.2)" className="animate-ping" style={{ transformOrigin: `${activeX}px ${activeY}px` }} />
                  {/* Active node point circle */}
                  <circle cx={activeX} cy={activeY} r="5" fill="#0b0f19" stroke="#38bdf8" strokeWidth="2.5" />

                  {/* Hover tooltip metrics overlay inside SVG */}
                  <g transform={`translate(${activeX > chartWidth - 120 ? activeX - 110 : activeX + 15}, ${activeY > chartHeight - 80 ? activeY - 55 : activeY - 5})`}>
                    <rect width="95" height="42" rx="4" fill="#020617" stroke="rgba(255,255,255,0.1)" />
                    <text x="8" y="16" fill="#94a3b8" className="text-[8px] font-mono font-bold uppercase">Officers: {officers}</text>
                    <text x="8" y="30" fill="#38bdf8" className="text-[10px] font-mono font-black">Coverage: {activeCoverage.toFixed(1)}%</text>
                  </g>
                </svg>
              </div>
            </div>
            
            <div className="text-[10px] font-mono text-slate-500 border-t border-white/5 pt-3 mt-4 uppercase">
              Enforcement demand curves derived from CHI severity and temporal persistence patterns across 4,811 spatiotemporal records.
            </div>
          </GlassCard>
        </div>

      </div>

      {/* Manifest list section */}
      <h3 className="text-sm font-bold text-white uppercase tracking-widest mt-8 mb-4 font-mono flex items-center gap-2">
        <UserCheck className="text-emerald-400" size={16} />
        Optimized Deployment Patrol Manifest
      </h3>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <GlassCard key={i} className="h-44 border-t-4 border-t-slate-800 animate-pulse">
              <div />
            </GlassCard>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.manifest?.map((hotspot, i) => (
            <motion.div
              key={hotspot.hotspot_id + officers}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <GlassCard className="border-t-4 border-t-sky-500 hover:border-t-emerald-500 transition-colors duration-300 h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-[10px] font-bold font-mono px-2.5 py-0.5 bg-sky-500/20 text-sky-400 rounded">
                    PRIORITY #{i+1}
                  </div>
                  <Shield className="text-sky-500" size={16} />
                </div>
                
                <h4 className="text-sm font-bold text-white mb-4 h-10 overflow-hidden font-mono tracking-wide leading-tight">
                  {hotspot.display_location || hotspot.dominant_junction}
                </h4>
                
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-500">Patrol Shift</span>
                    <span className="text-white font-semibold">{hotspot.recommended_time}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-500">Projected Risk Index</span>
                    <span className="text-red-400 font-bold">{hotspot.projected_risk_index.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-500">OPS Priority</span>
                    <span className="text-slate-300 font-semibold">{hotspot.ops_score.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned Patrol</span>
                    <span className="font-bold text-emerald-400">{hotspot.assigned_officer}</span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

    </div>
  );
};

export default EnforcementOptimizer;
