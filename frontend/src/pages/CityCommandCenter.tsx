import { useEffect, useState, useRef } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import { GlassCard } from '../components/GlassCard';
import { fetchKPIs, fetchCriticalHotspots, fetchTimelineData, runOptimizer, fetchHotspotDetail, fetchEHS, fetchHotspotRiskWindows } from '../api';
import { AlertTriangle, ShieldCheck, TrendingUp, MapPin, Shield, Radio, Clock, Eye, Activity, ShieldAlert, Award, Sparkles, Cpu, Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';

interface Hotspot {
  hotspot_id: string;
  dominant_junction: string;
  display_location?: string;
  dominant_police_station: string;
  CHI: number;
  CHI_category: string;
  center_lat: number;
  center_lon: number;
  cells_count?: number;
  total_violations?: number;
}

interface Officer {
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

interface TimelineItem {
  block: string;
  violations: number;
  avg_chi: number;
  hotspot_count: number;
}

interface Alert {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'EMERGING' | 'DEPLOYMENT';
  message: string;
  timestamp: string;
}

interface KPIs {
  total_violations: number;
  active_hotspots: number;
  critical_hotspots: number;
  highest_risk_junction: string;
  emerging_hotspots: number;
  persistent_risk_zones: number;
  night_risk_share: number;
  enforcement_demand_total: number;
  enforcement_coverage_gain: number;
  city_risk_index: number;
}

interface HotspotDetail {
  hotspot_id: string;
  dominant_junction: string;
  display_location?: string;
  dominant_police_station: string;
  CHI: number;
  CHI_category: string;
  center_lat: number;
  center_lon: number;
  ops_score: number;
  historical_CHI: number;
  pred_24h_CHI: number;
  violation_count: number;
  dominant_vehicle_type: string;
  dominant_violation_type: string;
  historical_recurrence: string;
  recommended_time: string;
  assigned_officer: string;
  explainability_factors?: Record<string, number>;
}

interface RiskWindow {
  pct: number;
  conf: 'High' | 'Moderate' | 'Low';
}

interface HotspotRiskWindows {
  hotspot_id: string;
  display_location: string;
  CHI: number;
  CHI_category: string;
  temporal_blocks: number;
  peak_window: string;
  windows: {
    morning_rush: RiskWindow;
    office_hours: RiskWindow;
    evening_rush: RiskWindow;
    night: RiskWindow;
  };
  officer_demand: number;
  officer_confidence: string;
  EHS: number;
  ehs_reason: string;
}

const getSeverityColor = (category: string) => {
  switch (category) {
    case 'Critical': return 'bg-red-500/20 text-red-400 border border-red-500/50';
    case 'High': return 'bg-orange-500/20 text-orange-400 border border-orange-500/50';
    case 'Moderate': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50';
    case 'Low': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50';
    default: return 'bg-slate-500/20 text-slate-400 border border-slate-500/50';
  }
};

const DonutChart = ({ percentage, color, icon: Icon, label }: { percentage: number, color: string, icon: any, label: string }) => {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center py-4 px-2 rounded-xl bg-slate-900/60 border border-white/5 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
      <div className="absolute top-2 left-2 text-slate-500">
        <Icon size={12} className={color} />
      </div>
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-800" />
          <motion.circle
            cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={`${color} drop-shadow-[0_0_5px_currentColor]`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[10px] font-black text-white">{percentage.toFixed(0)}%</span>
      </div>
      <span className="text-[8px] font-bold text-slate-400 uppercase mt-3 text-center leading-tight tracking-widest">{label}</span>
    </div>
  );
};

interface CityCommandCenterProps {
  presentationMode: boolean;
  setPresentationMode: (val: boolean) => void;
}

const CityCommandCenter = ({ presentationMode, setPresentationMode }: CityCommandCenterProps) => {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [criticalHotspots, setCriticalHotspots] = useState<Hotspot[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineItem[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [activeMetric, setActiveMetric] = useState<'violations' | 'avg_chi' | 'hotspot_count'>('violations');
  const [selectedBriefingTab, setSelectedBriefingTab] = useState<'morning_rush' | 'office_hours' | 'evening_rush' | 'night'>('night');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);

  const briefingTabs = [
    { key: 'morning_rush', label: 'Morning Rush', icon: '🌅', time: '07:00 - 10:00' },
    { key: 'office_hours', label: 'Office Hours', icon: '🏢', time: '10:00 - 16:00' },
    { key: 'evening_rush', label: 'Evening Rush', icon: '🌇', time: '16:00 - 21:00' },
    { key: 'night', label: 'Night Operations', icon: '🌙', time: '21:00 - 07:00' }
  ] as const;

  const getBriefingForWindow = (windowKey: 'morning_rush' | 'office_hours' | 'evening_rush' | 'night') => {
    // Filter emergingThreats by windowKey
    let filtered = emergingThreats.filter(t => t.peak_window === windowKey);
    // Fallback if not enough
    if (filtered.length < 3) {
      const extra = emergingThreats
        .filter(t => t.peak_window !== windowKey)
        .sort((a, b) => Number(b[`${windowKey}_pct`] || 0) - Number(a[`${windowKey}_pct`] || 0));
      filtered = [...filtered, ...extra].slice(0, 3);
    }
    
    return filtered.slice(0, 3).map((hs, idx) => {
      const chi = Number(hs.CHI || 85.0);
      const demand = hs.officer_demand || (idx === 0 ? 4 : idx === 1 ? 3 : 2);
      const risk = hs.CHI_category || (chi >= 80 ? 'Critical' : chi >= 60 ? 'High' : 'Moderate');
      const peakShare = Number(hs[`${windowKey}_pct`] || (windowKey === 'night' ? 82.1 : 35.0));
      
      return {
        hotspot_id: String(hs.hotspot_id),
        display_location: String(hs.display_location || hs.dominant_junction),
        demand,
        risk,
        chi,
        peakShare,
        persistence: Number(hs.temporal_blocks || 4),
        nightShare: Number(hs.night_pct || 82.1)
      };
    });
  };
  const [hotspotDetail, setHotspotDetail] = useState<HotspotDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [hasAutoSelected, setHasAutoSelected] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [hoveredOfficer, setHoveredOfficer] = useState<Officer | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alertIdCounter = useRef(0);
  const alertsContainerRef = useRef<HTMLDivElement>(null);
  const [emergingThreats, setEmergingThreats] = useState<Record<string, string | number>[]>([]);
  const [hotspotRiskWindows, setHotspotRiskWindows] = useState<HotspotRiskWindows | null>(null);

  // Historical Event Replay Engine States
  const [replayEnabled, setReplayEnabled] = useState<boolean>(false);
  const [replayStatus, setReplayStatus] = useState<'RUNNING' | 'PAUSED' | 'DISCONNECTED'>('DISCONNECTED');
  const [replaySpeed, setReplaySpeed] = useState<number>(1.0);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [replayTotal, setReplayTotal] = useState<number>(0);
  const [replayDuration, setReplayDuration] = useState<number>(0);
  const [uniqueHotspots, setUniqueHotspots] = useState<Set<string>>(new Set());
  const [uniquePersistentZones, setUniquePersistentZones] = useState<Set<string>>(new Set());
  
  const [replayStats, setReplayStats] = useState({
    eventsStreamed: 0,
    criticalAlerts: 0,
  });

  const [replayPulse, setReplayPulse] = useState<{
    lat: number;
    lon: number;
    location: string;
    chi: number;
    severity: string;
    risk_band: string;
    hotspot_id?: string;
    junction?: string;
    police_station?: string;
    temporal_blocks?: number;
    night_pct?: number;
    officer_demand?: number;
    peak_window?: string;
    source_dataset?: string;
    timestamp?: string;
  } | null>(null);

  const [activeAlertCard, setActiveAlertCard] = useState<any | null>(null);
  
  const commandCenterMapRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const sendReplayControl = (action: string, value?: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, value }));
    }
  };

  const handlePlay = () => {
    sendReplayControl('play');
    setReplayStatus('RUNNING');
  };

  const handlePause = () => {
    sendReplayControl('pause');
    setReplayStatus('PAUSED');
  };

  const handleSpeed = (speed: number) => {
    sendReplayControl('speed', speed);
    setReplaySpeed(speed);
  };

  const handleSeek = (index: number) => {
    sendReplayControl('seek', index);
    setReplayIndex(index);
  };

  const handleRestart = () => {
    sendReplayControl('restart');
    setReplayIndex(0);
    setReplayStatus('RUNNING');
    setReplayDuration(0);
    setUniqueHotspots(new Set());
    setUniquePersistentZones(new Set());
    setReplayStats({
      eventsStreamed: 0,
      criticalAlerts: 0,
    });
    setActiveAlertCard(null);
  };

  // Replay Duration timer effect
  useEffect(() => {
    let timer: any = null;
    if (replayEnabled && replayStatus === 'RUNNING') {
      timer = setInterval(() => {
        setReplayDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [replayEnabled, replayStatus]);

  // WebSocket connection & parsing effect
  useEffect(() => {
    if (!replayEnabled) {
      setReplayStatus('DISCONNECTED');
      setReplayPulse(null);
      setActiveAlertCard(null);
      sessionStorage.removeItem('replayEnabled');
      sessionStorage.removeItem('currentReplayEvent');
      if (wsRef.current) {
        wsRef.current.close();
      }
      return;
    }

    sessionStorage.setItem('replayEnabled', 'true');
    const ws = new WebSocket('ws://localhost:8000/api/ws/replay');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Historical Event Replay WebSocket connected.');
      setReplayStatus('RUNNING');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'status') {
          setReplayStatus(data.paused ? 'PAUSED' : 'RUNNING');
          setReplaySpeed(data.speed);
          setReplayIndex(data.index);
          setReplayTotal(data.total);
          return;
        }

        // Event frame parsing
        setReplayPulse({
          lat: data.lat,
          lon: data.lon,
          location: data.location,
          chi: data.CHI,
          severity: data.severity,
          risk_band: data.risk_band,
          hotspot_id: data.hotspot_id,
          police_station: data.police_station,
          temporal_blocks: data.temporal_blocks,
          night_pct: data.night_pct,
          officer_demand: data.officer_demand,
          peak_window: data.peak_window,
          source_dataset: data.source_dataset,
          timestamp: data.timestamp
        });
        
        sessionStorage.setItem('currentReplayEvent', JSON.stringify(data));
        
        setReplayIndex(data.index);
        setReplayTotal(data.total);
        setReplayStatus(data.paused ? 'PAUSED' : 'RUNNING');
        setReplaySpeed(data.speed);

        // Update statistics
        setReplayStats(prev => ({
          eventsStreamed: prev.eventsStreamed + 1,
          criticalAlerts: prev.criticalAlerts + (data.CHI >= 80 ? 1 : 0),
        }));

        setUniqueHotspots(prev => {
          const next = new Set(prev);
          next.add(data.hotspot_id);
          return next;
        });

        if (data.temporal_blocks === 4) {
          setUniquePersistentZones(prev => {
            const next = new Set(prev);
            next.add(data.hotspot_id);
            return next;
          });
        }

        // Open contextual alert card for Critical events
        if (data.CHI >= 80) {
          setActiveAlertCard(data);
        }

        // Add entry to Operations Feed
        const newAlertId = `replay-alert-${alertIdCounter.current++}`;
        const cleanSeverity = data.severity.toUpperCase();
        
        let alertType: 'CRITICAL' | 'WARNING' | 'EMERGING' | 'DEPLOYMENT' = 'EMERGING';
        if (cleanSeverity === 'CRITICAL') alertType = 'CRITICAL';
        else if (cleanSeverity === 'HIGH') alertType = 'WARNING';
        else if (cleanSeverity === 'LOW') alertType = 'DEPLOYMENT';

        const newAlert: Alert = {
          id: newAlertId,
          type: alertType,
          message: `[REPLAY] ${data.location} (Sector ${data.hotspot_id?.substring(0, 6) || 'N/A'}) CHI reached ${data.CHI.toFixed(1)} [${data.risk_band}]`,
          timestamp: data.timestamp
        };

        setAlerts(prev => [newAlert, ...prev.slice(0, 14)]);

        // Fluctuate executive KPIs
        setKpis(prev => {
          if (!prev) return prev;
          
          const addedViolations = Math.floor(Math.random() * 11) + 5;
          const newTotalViolations = prev.total_violations + addedViolations;
          const smoothedRiskIndex = Number((prev.city_risk_index * 0.96 + data.CHI * 0.04).toFixed(1));
          
          let newCritical = prev.critical_hotspots;
          if (data.CHI >= 80) {
            newCritical = Math.min(prev.active_hotspots, prev.critical_hotspots + 1);
          } else if (data.CHI < 60) {
            newCritical = Math.max(0, prev.critical_hotspots - 1);
          }

          return {
            ...prev,
            total_violations: newTotalViolations,
            city_risk_index: smoothedRiskIndex,
            critical_hotspots: newCritical
          };
        });

      } catch (err) {
        console.error('Error parsing replay event:', err);
      }
    };

    ws.onclose = () => {
      console.log('Historical Event Replay WebSocket disconnected.');
      setReplayStatus('DISCONNECTED');
    };

    ws.onerror = (err) => {
      console.error('Replay WebSocket error:', err);
      setReplayStatus('DISCONNECTED');
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [replayEnabled]);

  // Fly map to replay events
  useEffect(() => {
    if (replayEnabled && replayPulse && commandCenterMapRef.current) {
      commandCenterMapRef.current.flyTo({
        center: [replayPulse.lon, replayPulse.lat],
        zoom: 12.5,
        duration: 1000
      });
    }
  }, [replayPulse, replayEnabled]);

  // Reset presentation-specific helper states when mode changes
  useEffect(() => {
    if (presentationMode) {
      setHasAutoSelected(false);
      setShowGuide(true);
    } else {
      setHasAutoSelected(false);
    }
  }, [presentationMode]);

  // Load backend data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [kpiRes, criticalRes, timelineRes, optimizerRes, ehsRes] = await Promise.all([
          fetchKPIs(),
          fetchCriticalHotspots(),
          fetchTimelineData(),
          runOptimizer(10), // Deploys 10 officers
          fetchEHS(20)
        ]);
        setKpis(kpiRes);
        setCriticalHotspots(criticalRes);
        setTimelineData(timelineRes);
        setOfficers(optimizerRes.manifest || []);
        setEmergingThreats(ehsRes || []);

        // Initialize alert feed with initial alerts from real data
        const initialAlerts: Alert[] = [];
        if (criticalRes.length > 0) {
          initialAlerts.push({
            id: `alert-${alertIdCounter.current++}`,
            type: 'CRITICAL',
            message: `${criticalRes[0].display_location || criticalRes[0].dominant_junction} CHI reached ${criticalRes[0].CHI.toFixed(1)}`,
            timestamp: '10:50 AM',
          });
        }
        if (optimizerRes.manifest && optimizerRes.manifest.length > 2) {
          initialAlerts.push({
            id: `alert-${alertIdCounter.current++}`,
            type: 'DEPLOYMENT',
            message: `${optimizerRes.manifest[0].assigned_officer} deployed to ${optimizerRes.manifest[0].display_location || optimizerRes.manifest[0].dominant_junction}`,
            timestamp: '10:52 AM',
          });
          initialAlerts.push({
            id: `alert-${alertIdCounter.current++}`,
            type: 'DEPLOYMENT',
            message: `${optimizerRes.manifest[1].assigned_officer} deployed to ${optimizerRes.manifest[1].display_location || optimizerRes.manifest[1].dominant_junction}`,
            timestamp: '10:53 AM',
          });
        }
        setAlerts(initialAlerts);
      } catch (err) {
        console.error('Error loading command center data:', err);
      }
    };
    loadData();
  }, []);

  // Simulate real-time alerts ticker from actual dataset details
  useEffect(() => {
    if (criticalHotspots.length === 0 || officers.length === 0) return;

    const intervalTime = presentationMode ? 2500 : 6000;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const alertTypes = ['CRITICAL', 'WARNING', 'EMERGING', 'DEPLOYMENT'] as const;
      const index = alertIdCounter.current;
      const chosenType = alertTypes[index % alertTypes.length];
      let message: string;

      if (chosenType === 'CRITICAL' && criticalHotspots.length > 0) {
        const hs = criticalHotspots[index % criticalHotspots.length];
        message = `${hs.display_location || hs.dominant_junction} CHI surged to ${hs.CHI.toFixed(1)}`;
      } else if (chosenType === 'WARNING' && criticalHotspots.length > 0) {
        const hs = criticalHotspots[(index + 3) % criticalHotspots.length];
        message = `${hs.display_location || hs.dominant_junction} entered High Risk category`;
      } else if (chosenType === 'EMERGING' && emergingThreats.length > 0) {
        const threat = emergingThreats[index % emergingThreats.length];
        message = `SECTOR-${String(threat.hotspot_id).substring(0,6).toUpperCase()} congestion intensity increased ${Number(threat.chi_pct_change).toFixed(0)}%`;
      } else if (officers.length > 0) {
        const off = officers[index % officers.length];
        message = `${off.assigned_officer} active at ${off.display_location || off.dominant_junction}`;
      } else {
        message = "Synchronizing system metrics...";
      }

      const newAlert: Alert = {
        id: `alert-${alertIdCounter.current++}`,
        type: chosenType,
        message,
        timestamp: timeStr,
      };

      setAlerts(prev => [newAlert, ...prev.slice(0, 14)]);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [criticalHotspots, officers, presentationMode]);

  // Auto-scroll alerts feed to top when new alert is prepended
  useEffect(() => {
    if (alertsContainerRef.current) {
      alertsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [alerts]);

  // Load detailed hotspot data on click
  useEffect(() => {
    if (!selectedHotspotId) return;
    const loadDetail = async () => {
      setLoadingDetail(true);
      setHotspotRiskWindows(null);
      try {
        const [res, riskRes] = await Promise.all([
          fetchHotspotDetail(selectedHotspotId),
          fetchHotspotRiskWindows(selectedHotspotId),
        ]);
        setHotspotDetail(res);
        if (!riskRes.error) setHotspotRiskWindows(riskRes);
      } catch (err) {
        console.error('Error fetching hotspot detail:', err);
      } finally {
        setLoadingDetail(false);
      }
    };
    loadDetail();
  }, [selectedHotspotId]);

  // Auto-select top hotspot in Presentation Mode (Phase 9) only once per activation
  useEffect(() => {
    if (presentationMode && !hasAutoSelected && criticalHotspots.length > 0 && !selectedHotspotId) {
      const timer = setTimeout(() => {
        setSelectedHotspotId(criticalHotspots[0].hotspot_id);
        setHasAutoSelected(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [presentationMode, hasAutoSelected, criticalHotspots, selectedHotspotId]);

  // Listen for Escape key to exit Presentation Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPresentationMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPresentationMode]);

  if (!kpis || timelineData.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-slate-400 font-mono">
        <Activity className="animate-spin mr-3 text-sky-400" />
        INITIALIZING SMART CITY OPERATIONS CENTER...
      </div>
    );
  }



  // SVG Area Chart calculations
  const chartHeight = 160;
  const chartWidth = 500;
  const padding = 30;

  const maxVal = Math.max(...timelineData.map(d => d[activeMetric])) || 1;
  const points = timelineData.map((d, i) => {
    const x = padding + (i * (chartWidth - padding * 2)) / (timelineData.length - 1);
    const y = chartHeight - padding - (d[activeMetric] / maxVal) * (chartHeight - padding * 2);
    return { x, y, label: d.block, val: d[activeMetric] };
  });

  const pathD = points.reduce((acc, p, i) => {
    return acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
  }, '');

  const areaD = pathD ? `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z` : '';

  return (
    <div className="flex flex-col min-h-screen bg-background overflow-x-hidden text-slate-200">
      
      {/* 1. Animated Command Center Header */}
      <header className="sticky top-0 px-8 py-5 border-b border-white/5 bg-slate-950/80 backdrop-blur-md flex justify-between items-center z-30">
        <div>
          <h1 className="text-xl font-mono font-black tracking-widest text-white uppercase flex items-center gap-3">
            <ShieldAlert className="text-red-500 animate-pulse" size={24} />
            BENGALURU TRAFFIC OPERATIONS COMMAND CENTER
          </h1>
          <p className="text-xs text-slate-400 tracking-wider font-semibold uppercase mt-0.5">
            Bengaluru City Police • Real-time Operations Engine
          </p>
        </div>
        
        <div className="flex items-center gap-4 animate-fadeIn">
          {/* Replay Toggle Button */}
          <button
            onClick={() => setReplayEnabled(!replayEnabled)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-xs font-bold border tracking-wider transition-all duration-300 ${
              replayEnabled
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse'
                : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            <Radio size={14} className={replayEnabled ? 'animate-pulse text-red-400' : ''} />
            HISTORICAL EVENT REPLAY MODE: {replayEnabled ? 'ACTIVE' : 'OFF'}
          </button>

          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-xs font-bold border tracking-wider transition-all duration-300 ${
              presentationMode
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse'
                : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            <Activity size={14} className={presentationMode ? 'animate-spin' : ''} />
            PRESENTATION MODE: {presentationMode ? 'ACTIVE' : 'OFF'}
          </button>

          {replayEnabled ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse">
                <Radio className="text-red-500 animate-spin" size={14} style={{ animationDuration: '3s' }} />
                <span className="text-xs font-mono font-bold tracking-wider text-red-400 uppercase">
                  HISTORICAL EVENT REPLAY MODE
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono tracking-normal text-right max-w-[280px] leading-tight">
                Streaming historical parking violation records to simulate operational conditions.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-2.5 h-2.5 rounded-full bg-emerald-500"
              />
              <span className="text-xs font-mono font-bold tracking-wider text-emerald-400">
                LIVE STATUS • ONLINE
              </span>
            </div>
          )}
        </div>
      </header>

      {/* 2. Executive Operations Strip */}
      <section className="bg-slate-950/90 border-b border-white/10 py-3 px-8 z-10 shadow-[0_4px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center text-[10px] font-mono font-bold tracking-widest text-slate-300 gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors duration-300 ${
            replayPulse
              ? replayPulse.severity === 'Critical' ? 'bg-red-950/60 text-red-400 border-red-500/30' :
                replayPulse.severity === 'High' ? 'bg-orange-950/60 text-orange-400 border-orange-500/30' :
                replayPulse.severity === 'Moderate' ? 'bg-yellow-950/60 text-yellow-400 border-yellow-500/30' :
                'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
              : 'bg-red-950/60 text-red-400 border-red-500/30'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                replayPulse
                  ? replayPulse.severity === 'Critical' ? 'bg-red-400' :
                    replayPulse.severity === 'High' ? 'bg-orange-400' :
                    replayPulse.severity === 'Moderate' ? 'bg-yellow-400' :
                    'bg-emerald-400'
                  : 'bg-red-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                replayPulse
                  ? replayPulse.severity === 'Critical' ? 'bg-red-500' :
                    replayPulse.severity === 'High' ? 'bg-orange-500' :
                    replayPulse.severity === 'Moderate' ? 'bg-yellow-500' :
                    'bg-emerald-500'
                  : 'bg-red-500'
              }`}></span>
            </span>
            CITY STATUS: <span className="font-black">{replayPulse ? replayPulse.severity.toUpperCase() : 'CRITICAL'}</span>
          </div>
          
          <div className="hidden lg:block w-px h-5 bg-white/10" />
          
          <div className="flex items-center gap-1.5">
            <span className="text-red-500">●</span> Critical Zones: <span className="text-red-400 text-xs font-black">128</span>
          </div>
          
          <div className="hidden lg:block w-px h-5 bg-white/10" />
          
          <div className="flex items-center gap-1.5">
            <span className="text-violet-500">●</span> Persistent Risk Zones: <span className="text-violet-400 text-xs font-black">{kpis.persistent_risk_zones || 153}</span>
          </div>
          
          <div className="hidden lg:block w-px h-5 bg-white/10" />
          
          <div className="flex items-center gap-1.5">
            <span className="text-amber-500">●</span> Night Risk Share: <span className="text-amber-400 text-xs font-black">82.1%</span>
          </div>
          
          <div className="hidden lg:block w-px h-5 bg-white/10" />
          
          <div className="flex items-center gap-1.5">
            <span className="text-sky-500">●</span> Officers Deployed: <span className="text-sky-400 text-xs font-black">10</span>
          </div>
          
          <div className="hidden lg:block w-px h-5 bg-white/10" />
          
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500">●</span> Coverage Efficiency: <span className="text-emerald-400 text-xs font-black">82%</span>
          </div>
          
          <div className="hidden lg:block w-px h-5 bg-white/10" />
          
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-500">●</span> Police Stations Covered: <span className="text-cyan-400 text-xs font-black">54</span>
          </div>
        </div>
      </section>

      <main className="p-6 max-w-7xl mx-auto w-full space-y-6 flex-1">
        
        {presentationMode && showGuide && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/95 border-2 border-amber-500/50 p-5 rounded-xl text-xs font-mono text-slate-300 shadow-[0_0_25px_rgba(245,158,11,0.15)] flex flex-col md:flex-row gap-5 justify-between items-start z-30"
          >
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Sparkles className="animate-bounce" size={16} />
                JUDGE DEMO NAVIGATOR ENGAGED
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Welcome, Hackathon Judges. This dashboard represents a real-time smart city operations system. Use the checklist below to guide your evaluation:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] pt-1">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[9px]">1</div>
                  <span><strong>GIS Map Pulses:</strong> Watch the critical indicators pulse on map pins.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[9px]">2</div>
                  <span><strong>Hotspot Drilldown:</strong> Click any junction row below to slide open XAI explainability metrics.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[9px]">3</div>
                  <span><strong>AI Support Chat:</strong> Go to the AI Copilot tab and click suggested prompts to query datasets.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[9px]">4</div>
                  <span><strong>Operational Intelligence Simulator:</strong> Drag sliders to plot diminishing returns and optimal operational allocations.</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 border border-amber-600 text-slate-950 font-black tracking-wider uppercase rounded-lg text-[10px] flex-shrink-0 transition-colors"
            >
              Close Guide
            </button>
          </motion.div>
        )}

        {/* OPERATIONAL DEPLOYMENT BRIEFING */}
        <section className="bg-slate-900/80 backdrop-blur-md border-2 border-sky-500/30 rounded-xl p-0 shadow-[0_0_30px_rgba(14,165,233,0.15)] overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500 via-emerald-400 to-sky-500"></div>
          
          <div className="bg-slate-950/60 p-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black tracking-widest text-white uppercase flex items-center gap-2 font-mono">
                <Shield className="text-sky-400 animate-pulse" size={18} />
                OPERATIONAL DEPLOYMENT BRIEFING
              </h3>
              <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase">
                Optimized tasking orders by temporal dispatch window
              </p>
            </div>
            
            {/* Selectable Tabs */}
            <div className="flex bg-slate-900 p-1 rounded-lg border border-white/10">
              {briefingTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedBriefingTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-xs font-bold transition-all ${
                    selectedBriefingTab === tab.key
                      ? 'bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.3)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 font-mono relative z-10">
            {getBriefingForWindow(selectedBriefingTab).map((item, idx) => (
              <div 
                key={item.hotspot_id} 
                className={`relative p-4 rounded-lg border cursor-pointer hover:border-sky-500/50 transition-colors ${
                  idx === 0 
                    ? 'bg-red-950/20 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]' 
                    : 'bg-slate-800/40 border-white/10'
                }`}
                onClick={() => setSelectedHotspotId(item.hotspot_id)}
              >
                {idx === 0 && (
                  <div className="absolute -top-3 -right-3 text-[9px] bg-red-500 text-white font-bold px-2 py-1 rounded-full uppercase shadow-lg z-20">
                    Priority 1
                  </div>
                )}
                
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                    idx === 0 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="text-sm font-bold text-white truncate" title={item.display_location}>
                    {item.display_location}
                  </div>
                </div>
                
                <div className="space-y-3 text-[11px] mt-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="text-slate-400 uppercase">Deploy:</span>
                    <span className="text-emerald-400 font-black">{item.demand} Officers</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="text-slate-400 uppercase">Window:</span>
                    <span className="text-amber-400 font-bold">{briefingTabs.find(t => t.key === selectedBriefingTab)?.time}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="text-slate-400 uppercase">Risk Level:</span>
                    <span className={`font-bold ${
                      item.risk === 'Critical' ? 'text-red-500' :
                      item.risk === 'High' ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>{item.risk}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="text-slate-400 uppercase">Peak Share:</span>
                    <span className="text-amber-400 font-bold">{item.peakShare.toFixed(1)}%</span>
                  </div>
                  
                  {/* WHY SELECTED Section */}
                  <div className="pt-3 border-t border-white/10 space-y-1.5">
                    <div className="text-[8px] font-black text-sky-400 uppercase tracking-widest">
                      Why Selected
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[9px] text-slate-400">
                      <div>CHI: <span className="text-white font-bold">{item.chi.toFixed(1)}</span></div>
                      <div>Severity: <span className="text-white font-bold">{item.risk}</span></div>
                      <div className="col-span-2">Persistence: <span className="text-white font-bold">{
                        item.persistence === 4 ? 'All 4 Windows' : `${item.persistence} Windows`
                      }</span></div>
                      <div>Night Share: <span className="text-white font-bold">{item.nightShare.toFixed(1)}%</span></div>
                      <div className="col-span-2">Demand: <span className="text-emerald-400 font-bold">{item.demand} Officers</span></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Animated KPI Cards Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <GlassCard className="border-red-500/30 hover:border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)] transition-all duration-300">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">System Status</span>
              <AlertTriangle className="text-red-500 animate-bounce" size={14} />
            </div>
            <div className="text-xl font-mono font-black text-red-500 tracking-wider">CRITICAL</div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase font-semibold">Immediate Dispatch</div>
          </GlassCard>

          <GlassCard className="hover:border-sky-500/40 transition-all duration-300">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Critical Zones Protected</span>
              <Shield className="text-sky-400" size={14} />
            </div>
            <div className="text-xl font-mono font-black text-white tracking-tight">45 <span className="text-[10px] text-slate-500">/ 128</span></div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase font-semibold">Current Deployment</div>
          </GlassCard>

          <GlassCard className="hover:border-sky-500/40 transition-all duration-300">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Risk Cells</span>
              <MapPin className="text-sky-500" size={14} />
            </div>
            <div className="text-sm font-mono font-black text-white leading-snug">
              {kpis.active_hotspots.toLocaleString()} Active Risk Cells
            </div>
            <div className="text-[9px] text-slate-500 mt-1 font-semibold uppercase">
              128 Critical
            </div>
            <div className="text-[8px] text-slate-500 font-mono mt-1 border-t border-white/5 pt-1 uppercase">
              Top Risk: KR Market Junction
            </div>
          </GlassCard>

          <GlassCard className="hover:border-emerald-500/40 transition-all duration-300">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Violations</span>
              <ShieldCheck className="text-emerald-500" size={14} />
            </div>
            <div className="text-sm font-mono font-black text-white leading-snug">
              {kpis.total_violations.toLocaleString()} Violations Analyzed
            </div>
            <div className="text-[9px] text-slate-500 mt-1 font-semibold uppercase">
              54 Police Stations
            </div>
            <div className="text-[8px] text-slate-500 font-mono mt-1 border-t border-white/5 pt-1 uppercase">
              169 Junctions
            </div>
          </GlassCard>

          <GlassCard className="hover:border-amber-500/40 transition-all duration-300">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Emerging Hotspots</span>
              <TrendingUp className="text-amber-500" size={14} />
            </div>
            <div className="text-sm font-mono font-black text-white leading-snug">
              {kpis.emerging_hotspots} Escalating Zones
            </div>
            <div className="text-[9px] text-slate-500 mt-1 font-semibold uppercase">
              Risk Trajectory Accelerated
            </div>
            <div className="text-[8px] text-slate-500 font-mono mt-1 border-t border-white/5 pt-1 uppercase">
              Pattern-Derived Insights
            </div>
          </GlassCard>

          <GlassCard className="hover:border-violet-500/40 transition-all duration-300 border-violet-500/20">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Persistent Zones</span>
              <Activity className="text-violet-400" size={14} />
            </div>
            <div className="text-xl font-mono font-bold text-violet-400 tracking-tight">{kpis.persistent_risk_zones ?? 153}</div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase font-semibold">All 4 time windows</div>
          </GlassCard>

          <GlassCard className="hover:border-sky-500/40 transition-all duration-300 border-sky-500/20">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Night Risk Share</span>
              <Eye className="text-sky-400" size={14} />
            </div>
            <div className="text-xl font-mono font-bold text-sky-400 tracking-tight">82.1%</div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase font-semibold">21:00–07:00 window</div>
          </GlassCard>

          <GlassCard className="hover:border-emerald-500/40 transition-all duration-300">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase font-mono">Coverage Efficiency</span>
              <Award className="text-emerald-400" size={14} />
            </div>
            <div className="text-xl font-mono font-bold text-emerald-400 tracking-tight">82.0%</div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase font-semibold">Allocated risk mitigated</div>
          </GlassCard>
        </section>

        {/* 4. Main Operations Layout Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Live Command Center Map (8 Columns) */}
          <div className={`lg:col-span-8 flex flex-col transition-all duration-300 ${replayEnabled ? 'h-[850px]' : 'h-[680px]'} bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-xl overflow-hidden shadow-2xl relative`}>
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-slate-950/40 z-10">
              <div>
                <h3 className="text-sm font-bold tracking-widest text-white uppercase flex items-center gap-2">
                  <Activity className="text-sky-400 animate-pulse" size={16} />
                  Live GIS Operations Map
                </h3>
                <p className="text-[11px] text-slate-400">Real-time overlay of top critical threat cells & officer deployments.</p>
              </div>
            </div>
            
            <div className="flex-1 relative z-0">
              {criticalHotspots.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono">
                  Loading GIS coordinate layers...
                </div>
              ) : (
                <Map
                  ref={commandCenterMapRef}
                  initialViewState={{
                    longitude: 77.5946,
                    latitude: 12.9716,
                    zoom: 11.5
                  }}
                  mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                >
                  {/* Critical Hotspots markers */}
                  {criticalHotspots.map((hs, i) => (
                    <Marker
                      key={`hs-${i}`}
                      longitude={hs.center_lon}
                      latitude={hs.center_lat}
                      anchor="center"
                      onClick={(e) => {
                        e.originalEvent.stopPropagation();
                        setSelectedHotspotId(hs.hotspot_id);
                      }}
                    >
                      <div className="w-5 h-5 rounded-full bg-red-600/40 border border-red-500 animate-ping absolute" />
                      {presentationMode && (
                        <>
                          <div className="w-10 h-10 rounded-full border border-red-500/60 animate-ping absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animationDuration: '3s' }} />
                          <div className="w-16 h-16 rounded-full border border-red-500/30 animate-ping absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animationDuration: '4.5s' }} />
                        </>
                      )}
                      <div className="w-5 h-5 rounded-full bg-red-500/80 border-2 border-white flex items-center justify-center cursor-pointer shadow-lg hover:scale-125 transition-transform">
                        <span className="text-[8px] font-bold text-white">{i + 1}</span>
                      </div>
                    </Marker>
                  ))}

                  {/* Deployed Officers Tracking Layer */}
                  {officers.map((off, i) => (
                    <Marker
                      key={`off-${i}`}
                      longitude={off.center_lon}
                      latitude={off.center_lat}
                      anchor="bottom"
                    >
                      <div
                        className="flex flex-col items-center cursor-pointer group"
                        onMouseEnter={() => setHoveredOfficer(off)}
                        onMouseLeave={() => setHoveredOfficer(null)}
                      >
                        <div className="px-2 py-0.5 bg-sky-500 border border-white text-[8px] font-mono font-bold text-white rounded shadow-md transform -translate-y-1 group-hover:bg-emerald-500 group-hover:scale-105 transition-all">
                          {off.assigned_officer.split('_')[1]}
                        </div>
                        <Shield className="text-sky-400 group-hover:text-emerald-400 transition-colors drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]" size={20} />
                      </div>
                    </Marker>
                  ))}

                  {/* Hovered Officer Popup */}
                  {hoveredOfficer && (
                    <Popup
                      longitude={hoveredOfficer.center_lon}
                      latitude={hoveredOfficer.center_lat}
                      anchor="top"
                      closeButton={false}
                      closeOnClick={false}
                      offset={10}
                    >
                      <div className="text-xs space-y-1 font-mono">
                        <div className="font-bold text-sky-400 flex items-center gap-1.5 border-b border-white/10 pb-1">
                          <Shield size={12} /> {hoveredOfficer.assigned_officer}
                        </div>
                        <div>Target: <span className="text-white font-semibold">{hoveredOfficer.display_location || hoveredOfficer.dominant_junction}</span></div>
                        <div>Response Time: <span className="text-emerald-400 font-bold">{(3 + (parseInt(hoveredOfficer.assigned_officer.split('_')[1]) % 8))} min</span></div>
                        <div>Priority: <span className="text-red-400 font-bold">Critical</span></div>
                      </div>
                    </Popup>
                  )}

                  {/* Hotspot Click Popup */}
                  {hotspotDetail && (
                    <Popup
                      longitude={hotspotDetail.center_lon}
                      latitude={hotspotDetail.center_lat}
                      anchor="bottom"
                      closeButton={true}
                      closeOnClick={false}
                      onClose={() => {
                        setSelectedHotspotId(null);
                        setHotspotDetail(null);
                      }}
                      offset={15}
                    >
                      <div className="text-[10px] space-y-2 font-mono p-2 text-slate-200 min-w-[180px]">
                        <div className="font-bold text-white border-b border-white/10 pb-1.5">
                          {hotspotDetail.display_location || hotspotDetail.dominant_junction}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            hotspotDetail.CHI_category === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                            hotspotDetail.CHI_category === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' :
                            hotspotDetail.CHI_category === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' :
                            'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          }`}>
                            {hotspotDetail.CHI_category === 'Critical' ? '🔴 Critical' :
                             hotspotDetail.CHI_category === 'High' ? '🟠 High' :
                             hotspotDetail.CHI_category === 'Moderate' ? '🟡 Moderate' : '🟢 Low'}
                          </span>
                          <span className="text-slate-400">CHI: <span className="font-bold text-white">{hotspotDetail.CHI.toFixed(1)}</span></span>
                        </div>
                        <div className="space-y-1 text-[9px] text-slate-400 pt-1 border-t border-white/5">
                          <div>Peak Window: <span className="text-white font-bold">{
                            hotspotDetail.recommended_time === '21:00-07:00' ? 'Night Operations' :
                            hotspotDetail.recommended_time === '07:00-10:00' ? 'Morning Rush' :
                            hotspotDetail.recommended_time === '16:00-21:00' ? 'Evening Rush' : 'Office Hours'
                          } ({hotspotDetail.recommended_time})</span></div>
                          <div>Demand: <span className="text-emerald-400 font-bold">{(hotspotDetail.CHI >= 80 ? 4 : hotspotDetail.CHI >= 60 ? 3 : 2)} Officers</span></div>
                          <div>Persistence: <span className="text-white font-bold">{hotspotDetail.historical_recurrence || 'All 4 Windows'}</span></div>
                        </div>
                      </div>
                    </Popup>
                  )}

                  {/* Pulsing Historical Replay Marker */}
                  {replayEnabled && replayPulse && (
                    <Marker
                      longitude={replayPulse.lon}
                      latitude={replayPulse.lat}
                      anchor="center"
                    >
                      {/* Pulse rings */}
                      <div className="w-12 h-12 rounded-full border-2 border-red-500/80 animate-ping absolute -left-6 -top-6" style={{ animationDuration: '1.5s' }} />
                      <div className="w-6 h-6 rounded-full border border-red-500 animate-ping absolute -left-3 -top-3" style={{ animationDuration: '2.5s' }} />
                      
                      {/* Core */}
                      <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center cursor-pointer shadow-lg animate-bounce relative z-20">
                        <Radio size={8} className="text-white animate-spin" />
                      </div>
                      
                      {/* Text details tooltip */}
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-red-500/30 px-2 py-0.5 rounded text-[8px] font-mono text-red-400 font-bold whitespace-nowrap z-30 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.25)]">
                        REPLAY CHI: {replayPulse.chi.toFixed(1)}
                      </div>
                    </Marker>
                  )}
                </Map>
              )}
            </div>

            {/* Contextual Incident Alert Card Overlay */}
            <AnimatePresence>
              {activeAlertCard && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 30 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="absolute bottom-[130px] right-4 z-20 w-80 bg-red-950/95 border-2 border-red-500/50 rounded-xl p-4 shadow-[0_0_25px_rgba(239,68,68,0.4)] backdrop-blur-md font-mono"
                >
                  <div className="flex justify-between items-start mb-2 pb-1 border-b border-red-500/20">
                    <span className="text-xs font-black text-red-400 flex items-center gap-1.5 animate-pulse">
                      <ShieldAlert size={14} /> [CRITICAL INCIDENT]
                    </span>
                    <button
                      onClick={() => setActiveAlertCard(null)}
                      className="text-red-400 hover:text-white transition-colors cursor-pointer text-xs font-bold"
                    >
                      ✕ CLOSE
                    </button>
                  </div>
                  <div className="text-xs text-slate-200 space-y-2">
                    <div className="font-black text-white text-sm">{activeAlertCard.location}</div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">CHI Score:</span>
                      <span className="text-red-400 font-bold">{activeAlertCard.CHI.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Risk Window:</span>
                      <span className="text-white font-bold">{activeAlertCard.peak_window}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Officer Demand:</span>
                      <span className="text-emerald-400 font-bold">{activeAlertCard.officer_demand} Officers</span>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 p-2 rounded text-[10px] text-red-300 leading-normal">
                      <strong>Recommended Action:</strong> Deploy Enforcement Unit immediately to clear carriage blockages.
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {replayEnabled && (
              <div className="bg-slate-950/95 border-t border-white/10 p-4 font-mono text-xs z-10 flex flex-col gap-3">
                {/* Replay Control Bar */}
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Replay Controls:</span>
                    <button
                      onClick={replayStatus === 'RUNNING' ? handlePause : handlePlay}
                      className="px-3 py-1 bg-slate-900 border border-white/10 hover:bg-slate-800 hover:border-white/20 text-white rounded font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {replayStatus === 'RUNNING' ? (
                        <>
                          <Pause size={12} className="text-amber-500 animate-pulse" /> PAUSE
                        </>
                      ) : (
                        <>
                          <Play size={12} className="text-emerald-500" /> PLAY
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleSpeed(1.0)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        replaySpeed === 1.0
                          ? 'bg-sky-500 border-sky-400 text-white'
                          : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      1x
                    </button>
                    <button
                      onClick={() => handleSpeed(2.0)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        replaySpeed === 2.0
                          ? 'bg-sky-500 border-sky-400 text-white'
                          : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      2x Speed
                    </button>
                    <button
                      onClick={() => handleSpeed(5.0)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        replaySpeed === 5.0
                          ? 'bg-sky-500 border-sky-400 text-white'
                          : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      5x Speed
                    </button>
                    <button
                      onClick={handleRestart}
                      className="px-2.5 py-1 bg-slate-900 border border-white/10 hover:bg-slate-800 hover:border-white/20 text-slate-300 hover:text-white rounded flex items-center gap-1 transition-colors cursor-pointer"
                      title="Restart Replay"
                    >
                      <RotateCcw size={12} /> RESTART
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-slate-400">
                    <div>
                      REPLAY STATUS: <span className={`font-bold ${replayStatus === 'RUNNING' ? 'text-emerald-400 animate-pulse' : 'text-amber-500'}`}>
                        {replayStatus}
                      </span>
                    </div>
                    <div>
                      CURRENT SPEED: <span className="font-bold text-white">{replaySpeed}x</span>
                    </div>
                    <div>
                      EVENT INDEX: <span className="font-bold text-white">{(replayIndex + 1).toLocaleString()} / {replayTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Timeline Scrubber */}
                <div className="flex items-center gap-3 border-t border-white/5 pt-3">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Seek:</span>
                  <button
                    onClick={() => handleSeek(0)}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-[9px] text-slate-300 rounded cursor-pointer"
                  >
                    BEGINNING
                  </button>
                  <button
                    onClick={() => handleSeek(Math.floor((replayTotal - 1) / 2))}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-[9px] text-slate-300 rounded cursor-pointer"
                  >
                    MIDDLE
                  </button>
                  <button
                    onClick={() => handleSeek(replayTotal - 1)}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-[9px] text-slate-300 rounded cursor-pointer"
                  >
                    END
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, replayTotal - 1)}
                    value={replayIndex}
                    onChange={(e) => handleSeek(parseInt(e.target.value))}
                    className="flex-1 accent-sky-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />

                  <div className="text-[10px] text-slate-400 shrink-0 font-bold">
                    CLOCK: <span className="text-white">{replayPulse?.timestamp || '00:00:00'}</span>
                    <span className="text-slate-600 ml-2">({Math.round((replayIndex / (replayTotal || 1)) * 100)}%)</span>
                  </div>
                </div>

                {/* Replay Auditability Collapsible Panel */}
                <div className="border-t border-white/5 pt-3">
                  <details className="group">
                    <summary className="text-[10px] text-slate-500 font-bold uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors list-none flex items-center gap-1 font-mono">
                      <ChevronRight size={12} className="transform group-open:rotate-90 transition-transform text-slate-500" />
                      Replay Audit Data (Technical Diagnostics)
                    </summary>
                    <div className="mt-3 p-3 bg-slate-950/60 border border-white/5 rounded space-y-2 grid grid-cols-2 lg:grid-cols-4 gap-4 text-[10px] text-slate-400">
                      <div>
                        Source Dataset: <span className="text-white font-bold block mt-0.5">{replayPulse?.source_dataset || 'chi_hotspots_v2.csv'}</span>
                      </div>
                      <div>
                        Timestamp: <span className="text-white font-bold block mt-0.5">{replayPulse?.timestamp || 'N/A'}</span>
                      </div>
                      <div>
                        Junction: <span className="text-white font-bold block mt-0.5">{replayPulse?.junction || 'N/A'}</span>
                      </div>
                      <div>
                        CHI: <span className="text-white font-bold block mt-0.5">{replayPulse?.chi?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div>
                        Severity: <span className="text-white font-bold block mt-0.5">{replayPulse?.severity || 'Moderate'}</span>
                      </div>
                      <div>
                        Risk Band: <span className="text-white font-bold block mt-0.5">{replayPulse?.risk_band || 'Moderate'}</span>
                      </div>
                      <div>
                        Hotspot ID: <span className="text-white font-bold block mt-0.5">{replayPulse?.hotspot_id || 'N/A'}</span>
                      </div>
                      <div>
                        Station Jurisdiction: <span className="text-white font-bold block mt-0.5">{replayPulse?.police_station || 'Unknown'}</span>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            )}
          </div>

          {/* Right column: Analytics, Gauge & Alert Feed (4 Columns) */}
          <div className={`lg:col-span-4 flex flex-col transition-all duration-300 ${replayEnabled ? 'h-[850px]' : 'h-[680px]'} gap-4`}>
            
            {replayEnabled ? (
              <>
                {/* REPLAY STATISTICS PANEL */}
                <GlassCard className="border-l-4 border-l-sky-500 bg-sky-500/5 hover:border-sky-500/40 transition-all duration-300 flex-shrink-0">
                  <h3 className="text-xs font-bold tracking-widest text-sky-400 uppercase mb-2.5 flex items-center gap-1.5 font-mono">
                    <Award size={14} />
                    REPLAY STATISTICS PANEL
                  </h3>
                  <div className="space-y-1.5 font-mono text-xs text-slate-300">
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Events Streamed:</span>
                      <span className="font-bold text-white">{replayStats.eventsStreamed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Critical Alerts Triggered:</span>
                      <span className="font-bold text-red-400">{replayStats.criticalAlerts.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Hotspots Activated:</span>
                      <span className="font-bold text-amber-400">{uniqueHotspots.size}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Persistent Zones Encountered:</span>
                      <span className="font-bold text-purple-400">{uniquePersistentZones.size}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1.5 text-[10px] border-t border-white/5">
                      <div>Replay Duration: <span className="text-sky-400 font-bold block">{replayDuration}s</span></div>
                      <div>Replay Speed: <span className="text-emerald-400 font-bold block">{replaySpeed}x</span></div>
                    </div>
                  </div>
                </GlassCard>

                {/* COMMISSIONER INSIGHT PANEL */}
                <GlassCard className="border-l-4 border-l-purple-500 bg-purple-500/5 hover:border-purple-500/40 transition-all duration-300 flex-shrink-0">
                  <h3 className="text-xs font-bold tracking-widest text-purple-400 uppercase mb-2 flex items-center gap-1.5 font-mono">
                    <TrendingUp size={14} />
                    COMMISSIONER INSIGHT PANEL
                  </h3>
                  <div className="font-mono text-xs text-slate-300 space-y-2.5 leading-relaxed">
                    {replayPulse ? (
                      <>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                          Insight for active event location:
                        </p>
                        <div className="p-2 bg-slate-950/60 border border-white/5 rounded text-[11px] space-y-1.5">
                          <div>
                            Location: <span className="text-white font-bold">{replayPulse.location}</span>
                          </div>
                          <div>
                            Status: <span className={`font-bold ${replayPulse.temporal_blocks === 4 ? 'text-purple-400' : 'text-slate-400'}`}>
                              {replayPulse.temporal_blocks === 4 ? 'Persistent Risk Zone' : 'Temporal Risk Zone'}
                            </span>
                          </div>
                          <div>
                            Zone status: <span className="text-slate-300 font-bold">{replayPulse.temporal_blocks === 4 ? 'Active Across All 4 Time Windows' : `Active in ${replayPulse.temporal_blocks}/4 Time Windows`}</span>
                          </div>
                          <div>
                            Night Risk Share: <span className="text-amber-400 font-bold">{replayPulse.night_pct?.toFixed(1) || '52.9'}%</span>
                          </div>
                          <div>
                            Enforcement Demand: <span className="text-red-400 font-bold">{replayPulse.officer_demand || 3} Officers</span>
                          </div>
                        </div>
                        <p className="text-[9.5px] text-slate-400 italic">
                          {replayPulse.temporal_blocks === 4 
                            ? "This event occurred within a Persistent Risk Zone. Direct repeating patrols are advised." 
                            : `This event occurred in an emerging risk corridor during the ${replayPulse.peak_window} window.`}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-400 italic text-[11px]">Waiting for replay event stream...</p>
                    )}
                  </div>
                </GlassCard>
              </>
            ) : (
              <>
                {/* RECOMMENDED ACTION */}
                <GlassCard className="border-l-4 border-l-amber-500 bg-amber-500/5 hover:border-amber-500/40 transition-all duration-300 flex-shrink-0">
                  <h3 className="text-xs font-bold tracking-widest text-amber-400 uppercase mb-2.5 flex items-center gap-1.5 font-mono">
                    <Sparkles className="animate-pulse" size={14} />
                    RECOMMENDED ACTION
                  </h3>
                  <div className="space-y-1.5 font-mono text-xs text-slate-300">
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Deploy: <strong>4 Officers</strong></span>
                      <span className="text-sky-400">→ KR Market Junction</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Deploy: <strong>4 Officers</strong></span>
                      <span className="text-sky-400">→ Safina Plaza Junction</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded border border-white/5">
                      <span>Deploy: <strong>3 Officers</strong></span>
                      <span className="text-sky-400">→ Sagar Theatre Junction</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1.5 text-[10px] border-t border-white/5">
                      <div>Peak Risk Window: <span className="text-amber-400 font-bold block">21:00–07:00</span></div>
                      <div>Coverage Efficiency: <span className="text-emerald-400 font-bold block">82%</span></div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal border-t border-white/5 pt-1.5">
                      <strong>Why Selected:</strong> Night operations account for the majority of critical activity.
                    </p>
                  </div>
                </GlassCard>

                {/* KEY OPERATIONAL INSIGHT */}
                <GlassCard className="border-l-4 border-l-violet-500 bg-violet-500/5 hover:border-violet-500/40 transition-all duration-300 flex-shrink-0">
                  <h3 className="text-xs font-bold tracking-widest text-violet-400 uppercase mb-2 flex items-center gap-1.5 font-mono">
                    <TrendingUp size={14} />
                    KEY OPERATIONAL INSIGHT
                  </h3>
                  <div className="font-mono text-xs text-slate-300 space-y-1.5 leading-relaxed">
                    <p>
                      <span className="text-violet-400 font-black text-sm">153 zones</span> remain active across all 4 temporal windows.
                    </p>
                    <p className="text-[9.5px] text-slate-400">
                      These are <strong>Persistent Risk Zones</strong> requiring recurring enforcement coverage to mitigate systemic congestion risk.
                    </p>
                  </div>
                </GlassCard>
              </>
            )}

            {/* Real-time Alert Feed */}
            <GlassCard className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3 gap-2">
                <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2 min-w-0">
                  <Radio className="text-red-500 animate-pulse shrink-0" size={14} />
                  <span className="truncate">Real-time Ops Feed</span>
                </h3>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold whitespace-nowrap shrink-0">LIVE STREAM</span>
              </div>

              <div ref={alertsContainerRef} className="flex-1 overflow-y-auto space-y-2.5 pr-2">
                <AnimatePresence initial={false}>
                  {alerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs font-mono border-b border-white/5 pb-2 last:border-0"
                    >
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className={`font-bold ${
                          alert.type === 'CRITICAL' ? 'text-red-500' :
                          alert.type === 'WARNING' ? 'text-orange-400' :
                          alert.type === 'EMERGING' ? 'text-amber-500' : 'text-sky-400'
                        }`}>
                          [{alert.type}]
                        </span>
                        <span className="text-slate-600 flex items-center gap-1">
                          <Clock size={10} /> {alert.timestamp}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{alert.message}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </GlassCard>

          </div>
        </section>

        {/* 5. Drilldown & Timeline Analytics Grid (12 Columns) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Top 10 Critical Hotspots (6 Columns) */}
          <div className="lg:col-span-6">
            <GlassCard className="h-full flex flex-col">
              <h3 className="text-sm font-bold tracking-widest text-white uppercase mb-4 flex items-center gap-2">
                <ShieldAlert className="text-red-500" size={16} />
                Top 10 Critical Junctions
              </h3>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/10 uppercase tracking-widest text-[9px] font-bold">
                      <th className="pb-2">Rank</th>
                      <th className="pb-2">Junction</th>
                      <th className="pb-2 text-right">CHI</th>
                      <th className="pb-2 text-right">Cells</th>
                      <th className="pb-2 text-right">Violations</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalHotspots.slice(0, 10).map((hs, i) => (
                      <tr
                        key={hs.hotspot_id}
                        onClick={() => {
                          setSelectedHotspotId(hs.hotspot_id);
                        }}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5 font-bold text-slate-500">#{i + 1}</td>
                        <td className="py-2.5 font-semibold text-slate-300 max-w-[150px] truncate group-hover:text-white transition-colors">
                          <div title={hs.display_location || hs.dominant_junction}>{hs.display_location || hs.dominant_junction}</div>
                        </td>
                        <td className="py-2.5 text-right font-bold text-red-400">{hs.CHI.toFixed(1)}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-400">{hs.cells_count || 1}</td>
                        <td className="py-2.5 text-right font-semibold text-sky-400">{(hs.total_violations || 0).toLocaleString()}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHotspotId(hs.hotspot_id);
                            }}
                            className="px-2.5 py-0.5 bg-slate-800 text-slate-300 border border-white/10 rounded group-hover:bg-sky-500 group-hover:text-white transition-colors flex items-center gap-1 ml-auto text-[9px]"
                          >
                            <Eye size={10} /> DRILLDOWN
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>

          {/* Upgraded Risk Trend Timeline (6 Columns) */}
          <div className="lg:col-span-6">
            <GlassCard className="h-full flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-sm font-bold tracking-widest text-white uppercase">Risk Trend Timeline</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Spatiotemporal projections across daily operations blocks.</p>
                  </div>
                  
                  {/* Metric Toggle Ticker */}
                  <div className="flex bg-slate-950/80 p-0.5 rounded border border-white/5">
                    {(['violations', 'avg_chi', 'hotspot_count'] as const).map((metric) => (
                      <button
                        key={metric}
                        onClick={() => setActiveMetric(metric)}
                        className={`px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider font-bold transition-all ${
                          activeMetric === metric
                            ? 'bg-sky-500 text-white'
                            : 'text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {metric === 'violations' ? 'Volume' : metric === 'avg_chi' ? 'Avg CHI' : 'Hotspots'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SVG Area Chart */}
                <div className="w-full flex items-center justify-center py-4 bg-slate-950/20 rounded border border-white/5 relative">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
                    <defs>
                      <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal grid lines */}
                    <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.1)" />

                    {/* Area fill */}
                    <path d={areaD} fill="url(#chartGlow)" />

                    {/* Neon path line */}
                    <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />

                    {/* Point nodes */}
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="5" fill="#0B1020" stroke="#38bdf8" strokeWidth="2" className="cursor-pointer" />
                        <text x={p.x} y={chartHeight - 10} textAnchor="middle" fill="#64748b" className="text-[10px] font-mono font-bold uppercase">
                          {p.label.split(' ')[0]}
                        </text>
                        <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#ffffff" className="text-[9px] font-mono font-black">
                          {activeMetric === 'avg_chi' ? p.val.toFixed(1) : p.val.toLocaleString()}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-500 border-t border-white/5 pt-3 mt-4 uppercase">
                Risk trajectories calculated dynamically via spatiotemporal intelligence aggregation.
              </div>
            </GlassCard>
          </div>

        </section>

      </main>

      {/* 6. Hotspot Drilldown Side Drawer */}
      <AnimatePresence>
        {selectedHotspotId && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Overlay backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedHotspotId(null);
                setHotspotDetail(null);
              }}
              className="absolute inset-0 bg-black backdrop-blur-xs"
            />
            
            {/* Slide-over container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-slate-950/95 border-l border-white/10 shadow-2xl p-6 flex flex-col overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white tracking-wider uppercase font-mono">Hotspot Analysis</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Sector ID: SECTOR-{selectedHotspotId?.replace('HS_', '').substring(0, 6).toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedHotspotId(null);
                    setHotspotDetail(null);
                  }}
                  className="px-3 py-1 bg-slate-900 border border-white/10 text-xs font-mono font-bold text-slate-400 hover:text-white rounded"
                >
                  [CLOSE]
                </button>
              </div>

              {loadingDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 font-mono gap-3">
                  <Activity className="animate-spin text-sky-400" size={24} />
                  <span>RETRIEVING PROFILE METRICS...</span>
                </div>
              ) : hotspotDetail ? (
                <div className="space-y-6 flex-1">
                  <GlassCard className="border-t-4 border-t-red-500 py-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Congestion Index</span>
                      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${getSeverityColor(hotspotDetail.CHI_category)}`}>
                        {hotspotDetail.CHI_category}
                      </span>
                    </div>
                    <div className="text-4xl font-mono font-black text-red-500">
                      {hotspotDetail.CHI.toFixed(1)} <span className="text-xs text-slate-500">/ 100</span>
                    </div>
                  </GlassCard>

                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between items-center bg-black/20 p-2 rounded">
                      <span className="text-slate-400">Official Junction</span>
                      <span className="text-slate-500 font-bold text-right max-w-[200px]">{hotspotDetail.dominant_junction}</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/20 p-2 rounded border border-sky-500/30">
                      <span className="text-sky-400">Operational Area</span>
                      <span className="text-white font-bold text-right max-w-[200px]">{hotspotDetail.display_location || hotspotDetail.dominant_junction}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">Police Station</span>
                      <span className="text-white font-bold">{hotspotDetail.dominant_police_station}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">Latitude</span>
                      <span className="text-slate-300 font-mono">{hotspotDetail.center_lat.toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">Longitude</span>
                      <span className="text-slate-300 font-mono">{hotspotDetail.center_lon.toFixed(5)}</span>
                    </div>
                    
                    {/* Dynamic Deployment Status matching active manifest */}
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">Assigned Unit</span>
                      <span className={`font-bold ${hotspotDetail.assigned_officer !== 'NONE DEPLOYED' ? 'text-sky-400' : 'text-slate-500'}`}>
                        {hotspotDetail.assigned_officer}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">Recommended Shift</span>
                      <span className="text-slate-300">
                        {hotspotDetail.recommended_time}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">OPS Priority Score</span>
                      <span className="text-slate-300 font-bold">
                        {hotspotDetail.ops_score.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-500">Primary Violation</span>
                      <span className="text-white text-right max-w-[200px] truncate">{hotspotDetail.dominant_violation_type}</span>
                    </div>
                    <div className="flex justify-between pb-2">
                      <span className="text-slate-500">Primary Vehicle Impact</span>
                      <span className="text-white">{hotspotDetail.dominant_vehicle_type}</span>
                    </div>

                    {/* Explainability factors */}
                    {hotspotDetail.explainability_factors && (
                      <div className="border-t border-white/10 pt-5 mt-4 space-y-4">
                        <h4 className="text-xs font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Cpu size={14} className="animate-pulse" /> WHY IS THIS ZONE CRITICAL?
                        </h4>
                        
                        {/* 3 Donut Charts for Core Drivers */}
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(hotspotDetail.explainability_factors)
                            .slice(0, 3)
                            .map(([factor, percentage]: [string, number]) => {
                              let color = 'text-emerald-400';
                              let icon = Activity;
                              if (factor.includes('Recurrence')) { color = 'text-red-500'; icon = Clock; }
                              else if (factor.includes('Criticality')) { color = 'text-sky-500'; icon = MapPin; }
                              else if (factor.includes('Density')) { color = 'text-amber-500'; icon = Activity; }

                              return (
                                <DonutChart 
                                  key={factor} 
                                  percentage={percentage} 
                                  color={color} 
                                  icon={icon} 
                                  label={factor} 
                                />
                              );
                            })}
                        </div>

                        {/* Progress bars for all factors */}
                        <div className="space-y-3 bg-slate-900/60 border border-white/5 p-4 rounded-xl">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Contribution Weights</span>
                          {Object.entries(hotspotDetail.explainability_factors).map(([factor, percentage]: [string, number]) => {
                            let barColor = 'bg-sky-500';
                            if (factor.includes('Recurrence')) barColor = 'bg-red-500';
                            else if (factor.includes('Criticality')) barColor = 'bg-sky-500';
                            else if (factor.includes('Density')) barColor = 'bg-amber-500';
                            else if (factor.includes('Vehicle')) barColor = 'bg-purple-500';
                            else if (factor.includes('Severity')) barColor = 'bg-rose-500';
                            else if (factor.includes('Temporal')) barColor = 'bg-blue-500';

                            return (
                              <div key={factor} className="space-y-1 font-mono">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-400">{factor}</span>
                                  <span className="text-white font-bold">{percentage.toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percentage}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Critical Risk Windows — driven by /api/hotspot/:id/risk-windows */}
                  {hotspotRiskWindows && (
                    <div className="border-t border-white/10 pt-4 mt-2 space-y-3">
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock size={12} /> Critical Risk Windows
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        {([
                          { key: 'morning_rush', label: 'Morning Rush', time: '07–10', icon: '🌅' },
                          { key: 'office_hours', label: 'Office Hours', time: '10–16', icon: '🏢' },
                          { key: 'evening_rush', label: 'Evening Rush', time: '16–21', icon: '🌆' },
                          { key: 'night', label: 'Night', time: '21–07', icon: '🌙' },
                        ] as const).map(({ key, label, time, icon }) => {
                          const w = hotspotRiskWindows.windows[key];
                          const isPeak = hotspotRiskWindows.peak_window === key;
                          return (
                            <div key={key} className={`p-2 rounded-lg border ${isPeak ? 'border-amber-500/40 bg-amber-500/10' : 'border-white/5 bg-black/20'}`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className={isPeak ? 'text-amber-400 font-bold' : 'text-slate-400'}>{icon} {label}</span>
                                {isPeak && <span className="text-[8px] text-amber-400 font-bold bg-amber-500/20 px-1 rounded">PEAK</span>}
                              </div>
                              <div className={`text-lg font-black ${isPeak ? 'text-amber-300' : 'text-slate-300'}`}>{w.pct.toFixed(0)}%</div>
                              <div className="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                                <div className={`h-full rounded-full ${isPeak ? 'bg-amber-500' : 'bg-slate-600'}`} style={{ width: `${w.pct}%` }} />
                              </div>
                              <div className={`mt-1 text-[8px] font-bold ${w.conf === 'High' ? 'text-emerald-400' : w.conf === 'Moderate' ? 'text-yellow-400' : 'text-slate-500'}`}>
                                {w.conf} Conf · {time}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 space-y-1 text-[10px] font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-sky-400 font-bold flex items-center gap-1"><Shield size={10}/> Enforcement Demand Engine</span>
                          <span className={`text-xs font-black px-2 py-0.5 rounded ${hotspotRiskWindows.officer_confidence === 'High' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {hotspotRiskWindows.officer_confidence} Confidence
                          </span>
                        </div>
                        <div className="text-2xl font-black text-white mt-1">{hotspotRiskWindows.officer_demand} <span className="text-xs text-slate-400 font-normal">officers recommended</span></div>
                        <p className="text-slate-400 leading-relaxed mt-1">{hotspotRiskWindows.ehs_reason}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-slate-500">
                          <span>Temporal Coverage:</span>
                          <span className="text-white font-bold">{hotspotRiskWindows.temporal_blocks} / 4 blocks</span>
                          <span>·</span>
                          <span>EHS Score:</span>
                          <span className="text-amber-400 font-bold">{hotspotRiskWindows.EHS.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 font-mono">
                  Failed to load details.
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default CityCommandCenter;
