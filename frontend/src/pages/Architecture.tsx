import { GlassCard } from '../components/GlassCard';
import { Database, Binary, Hexagon, Gauge, BellRing, Cpu, LayoutDashboard, ArrowDown, Clock, UserCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface FlowStep {
  title: string;
  icon: React.ReactNode;
  description: string;
  details: string[];
}

const Architecture = () => {
  const steps: FlowStep[] = [
    {
      title: "Parking Violations [298,445 Violations]",
      icon: <Database className="text-sky-400" size={24} />,
      description: "Ingests raw historical registry of parking infractions across Bengaluru.",
      details: ["High-volume event processing", "Spatial coordinates extraction", "Categorical event normalization"]
    },
    {
      title: "Spatial Grouping [2,534 Spatial Cells]",
      icon: <Hexagon className="text-sky-400" size={24} />,
      description: "Groups localized events into geographic Uber H3 hexagons (Resolution 9).",
      details: ["Aggregates occurrences within 0.1 square km cells", "Standardizes spatial coordinate lookup", "Calculates base density index per cell"]
    },
    {
      title: "Persistence Analysis [153 Persistent Risk Zones]",
      icon: <BellRing className="text-sky-400" size={24} />,
      description: "Identifies zones active across all temporal blocks (Morning, Office, Evening, Night).",
      details: ["Classifies structurally ingrained risk locations", "Filters out random spatial noise", "Establishes baseline enforcement floors"]
    },
    {
      title: "Critical Risk Filter [128 Critical Zones]",
      icon: <Gauge className="text-sky-400" size={24} />,
      description: "Isolates the specific spatial cells carrying the highest historical concentration of severe infractions.",
      details: ["Vehicle type weights: trucks & heavy vehicles score higher", "Violation weights: double-parking scores higher", "Calculates maximum hazard intensity"]
    },
    {
      title: "OPS Optimization [38 Priority Deployments]",
      icon: <Cpu className="text-sky-400" size={24} />,
      description: "Ranks cells using the multi-criteria Operational Priority Score.",
      details: ["Weights: CHI + Demand + Volatility", "Applies chokepoint bonuses", "Generates the final rank-ordered deployment manifest"]
    },
    {
      title: "Resource Allocation [10 Officer Assignments]",
      icon: <UserCheck className="text-sky-400" size={24} />,
      description: "Mathematically derives the number of physical officers required per cell.",
      details: ["Demand = f(CHI band, Temporal Persistence)", "Scales unit requirements by risk severity", "Calculates maximum required deployment"]
    },
    {
      title: "Bengaluru Traffic Operations Command Center",
      icon: <LayoutDashboard className="text-sky-400" size={24} />,
      description: "Serves live maps, alerts, and Explainable AI Support to Traffic Commissioners.",
      details: ["Live operational simulator integration", "Hotspot drilldowns with Donut chart XAI", "Gemini-powered decision support"]
    }
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      
      {/* Header Info */}
      <div className="border-b border-white/5 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-mono font-black tracking-widest text-white uppercase flex items-center gap-3">
            <Cpu className="text-sky-400" size={28} />
            System Architecture
          </h1>
          <p className="text-xs text-slate-400 tracking-wider font-mono uppercase mt-0.5 font-semibold">
            Data Engineering & Decision Pipeline Flow
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 font-mono uppercase leading-relaxed max-w-2xl bg-slate-900/40 p-4 border border-white/5 rounded-lg">
        <strong>Judges Review Note:</strong> The platform ingests coordinate violation files, projects spatial risk coefficients, applies operational optimizations, and serves them to commissioners in real-time.
      </p>

      {/* Visual Pipeline timeline */}
      <div className="relative pl-8 space-y-8 mt-8 font-mono">
        {/* Animated glowing vertical line */}
        <motion.div 
          initial={{ height: 0 }}
          animate={{ height: '100%' }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="absolute left-[1px] top-4 w-[2px] bg-gradient-to-b from-sky-400 via-sky-500/50 to-transparent shadow-[0_0_10px_rgba(56,189,248,0.8)]"
        />
        {steps.map((step, idx) => (
          <div key={idx} className="relative group">
            
            {/* Pulsing indicator node */}
            <div className="absolute -left-[39px] top-1 flex items-center justify-center">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: idx * 0.2 }}
                className="w-5 h-5 rounded-full bg-slate-950 border-2 border-sky-500 flex items-center justify-center z-10"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 group-hover:scale-125 transition-transform" />
              </motion.div>
              <div className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500 animate-ping absolute" />
            </div>

            {/* Stage timeline card */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <GlassCard className="border border-white/5 hover:border-sky-500/30 transition-all duration-300">
                <div className="flex gap-4">
                  <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg flex-shrink-0 flex items-center justify-center h-12 w-12">
                    {step.icon}
                  </div>
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="text-[10px] text-sky-400 uppercase font-black tracking-widest">
                      STAGE 0{idx + 1}
                    </div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      {step.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {step.description}
                    </p>
                    <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 text-[10px] text-slate-500">
                      {step.details.map((detail, dIdx) => (
                        <li key={dIdx} className="flex items-center gap-1.5 border-l border-white/5 pl-2 leading-relaxed">
                          • {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Direction Arrow */}
            {idx < steps.length - 1 && (
              <div className="flex justify-center -mb-4 -mt-2 opacity-30 text-slate-500">
                <ArrowDown size={18} />
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
};

export default Architecture;
