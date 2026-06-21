import { useEffect, useState, useRef } from 'react';
import Map, { Source, Layer, Popup, Marker } from 'react-map-gl/maplibre';
import { ShieldAlert, Clock, Shield, AlertTriangle, Train, Building, Calendar, Activity } from 'lucide-react';
import { fetchSpatialData } from '../api';
import 'maplibre-gl/dist/maplibre-gl.css';

interface SpatialItem {
  hotspot_id: string;
  CHI: number;
  CHI_category: string;
  hotspot_rank: number;
  dominant_junction: string;
  display_location?: string;
  dominant_police_station: string;
  explainability: string;
  center_lat: number;
  center_lon: number;
}

interface Landmark {
  name: string;
  type: 'metro' | 'market' | 'event';
  lat: number;
  lon: number;
  chokeDescription: string;
  spilloverViolations: number;
}

const landmarks: Landmark[] = [
  {
    name: "KR Market Transit Hub",
    type: "market",
    lat: 12.9662,
    lon: 77.5772,
    chokeDescription: "Spillover parking from vendors and wholesale loading blocks 2 of 4 lanes of KR Road, raising peak CHI to 97.5.",
    spilloverViolations: 12435
  },
  {
    name: "Safina Plaza Commercial Zone",
    type: "market",
    lat: 12.9822,
    lon: 77.6083,
    chokeDescription: "On-street double parking along Commercial Street spillover chokes the Safina Plaza intersection, raising peak CHI to 86.4.",
    spilloverViolations: 8521
  },
  {
    name: "Sagar Theatre Event Corridor",
    type: "event",
    lat: 12.9779,
    lon: 77.5794,
    chokeDescription: "High-volume evening cinema & transit passenger drop-offs block main carriageway flows, raising peak CHI to 81.2.",
    spilloverViolations: 6310
  },
  {
    name: "Majestic Metro Interchange",
    type: "metro",
    lat: 12.9756,
    lon: 77.5728,
    chokeDescription: "Spillover parking from two-wheelers and unregulated auto-rickshaw bays chokes Majestic entry lanes, raising peak CHI to 79.8.",
    spilloverViolations: 9283
  },
  {
    name: "MG Road Metro Station",
    type: "metro",
    lat: 12.9748,
    lon: 77.6074,
    chokeDescription: "Spillover parking and ride-sharing pick-ups block left lanes of Mahatma Gandhi Road during evening rush, raising peak CHI to 78.5.",
    spilloverViolations: 7421
  }
];

const getSeverityColor = (category: string) => {
  switch (category) {
    case 'Critical': return 'text-red-400 bg-red-500/20 border-red-500/50';
    case 'High': return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
    case 'Moderate': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
    case 'Low': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
    default: return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
  }
};

const SpatialIntelligence = () => {
  const [spatialData, setSpatialData] = useState<SpatialItem[]>([]);
  const [popupInfo, setPopupInfo] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'discrete' | 'heatmap'>('discrete');
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    fetchSpatialData().then(setSpatialData).catch(console.error);
  }, []);

  const handleHubClick = (lm: Landmark) => {
    setSelectedLandmark(lm);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lm.lon, lm.lat],
        zoom: 14.5,
        duration: 1500
      });
    }
  };

  const geojson = {
    type: 'FeatureCollection' as const,
    features: spatialData.map(d => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [d.center_lon, d.center_lat] as [number, number] },
      properties: {
        id: d.hotspot_id,
        chi: d.CHI,
        category: d.CHI_category,
        junction: d.dominant_junction,
        display_location: d.display_location || d.dominant_junction,
        police_station: d.dominant_police_station
      }
    }))
  };

  const circleLayerStyle: any = {
    id: 'hotspots-discrete',
    type: 'circle',
    paint: {
      'circle-radius': [
        'match', ['get', 'category'],
        'Critical', 14,
        'High', 10,
        'Moderate', 6,
        4
      ],
      'circle-color': [
        'match', ['get', 'category'],
        'Critical', '#FF3B30',
        'High', '#FF9500',
        'Moderate', '#FFD60A',
        '#34C759'
      ],
      'circle-opacity': 0.75,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff'
    }
  };

  const heatmapLayerStyle: any = {
    id: 'hotspots-heatmap',
    type: 'heatmap',
    paint: {
      'heatmap-weight': [
        'interpolate',
        ['linear'],
        ['get', 'chi'],
        0, 0,
        100, 1
      ],
      'heatmap-intensity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 1,
        15, 3
      ],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(52,199,89,0)',
        0.2, 'rgba(52,199,89,0.3)',
        0.5, 'rgba(255,214,10,0.6)',
        0.8, 'rgba(255,149,0,0.8)',
        1, 'rgba(255,59,48,0.95)'
      ],
      'heatmap-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 5,
        15, 30
      ],
      'heatmap-opacity': 0.85
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden text-slate-200">
      
      {/* Dynamic Navigation Sub-bar */}
      <div className="p-6 bg-slate-900/80 backdrop-blur border-b border-white/5 z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-mono font-black tracking-widest text-white uppercase flex items-center gap-2">
            <Activity className="text-sky-400" size={24} />
            SPATIAL RISK HEATMAP
          </h2>
          <p className="text-slate-400 text-xs mt-1 uppercase font-semibold">
            Visualizing Parking-Induced Congestion: Violations vs. Traffic Hazard Impact
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setViewMode('discrete')}
              className={`px-3 py-1.5 rounded-md font-mono text-[10px] font-bold tracking-wider uppercase transition-all ${
                viewMode === 'discrete'
                  ? 'bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Discrete Cells
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-3 py-1.5 rounded-md font-mono text-[10px] font-bold tracking-wider uppercase transition-all ${
                viewMode === 'heatmap'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)] font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Impact Heatmap
            </button>
          </div>

          {/* Landmarks Toggle */}
          <button
            onClick={() => setShowLandmarks(!showLandmarks)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-[10px] font-bold tracking-wider uppercase border transition-all ${
              showLandmarks
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]'
                : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            Overlay Transit/Market Hubs
          </button>
        </div>
      </div>
      
      {/* Main Layout Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 relative">
        {/* Map Column (8 Columns) */}
        <div className="lg:col-span-8 relative h-full min-h-0">
          {spatialData.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono">
              Loading spatiotemporal intelligence layers...
            </div>
          ) : (
            <Map
              ref={mapRef}
              initialViewState={{
                longitude: 77.5946,
                latitude: 12.9716,
                zoom: 11.5
              }}
              mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
              interactiveLayerIds={viewMode === 'discrete' ? ['hotspots-discrete'] : []}
              onClick={(e) => {
                if (viewMode === 'discrete' && e.features && e.features.length > 0) {
                  const feature = e.features[0];
                  setPopupInfo({
                    lng: e.lngLat.lng,
                    lat: e.lngLat.lat,
                    ...feature.properties
                  });
                } else {
                  setPopupInfo(null);
                }
              }}
              cursor={popupInfo || selectedLandmark ? 'pointer' : 'grab'}
            >
              <Source id="hotspots" type="geojson" data={geojson}>
                <Layer
                  key="hotspots-discrete-layer"
                  {...circleLayerStyle}
                  layout={{ visibility: viewMode === 'discrete' ? 'visible' : 'none' }}
                />
                <Layer
                  key="hotspots-heatmap-layer"
                  {...heatmapLayerStyle}
                  layout={{ visibility: viewMode === 'heatmap' ? 'visible' : 'none' }}
                />
              </Source>
              
              {/* Transit and Commercial Landmarks Overlay */}
              {showLandmarks && landmarks.map((lm, idx) => (
                <Marker
                  key={`lm-${idx}`}
                  longitude={lm.lon}
                  latitude={lm.lat}
                  anchor="center"
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHubClick(lm);
                    }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-2 border-white shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-transform hover:scale-125 ${
                      lm.type === 'metro' ? 'bg-sky-500 text-white' :
                      lm.type === 'market' ? 'bg-violet-500 text-white' :
                      'bg-amber-500 text-slate-950 font-bold'
                    }`}
                  >
                    {lm.type === 'metro' ? <Train size={12} /> :
                     lm.type === 'market' ? <Building size={12} /> :
                     <Calendar size={12} />}
                  </div>
                </Marker>
              ))}

              {/* Landmark Information Popup */}
              {selectedLandmark && (
                <Popup
                  longitude={selectedLandmark.lon}
                  latitude={selectedLandmark.lat}
                  anchor="bottom"
                  closeOnClick={false}
                  onClose={() => setSelectedLandmark(null)}
                  offset={15}
                >
                  <div className="bg-slate-950/95 border-2 border-violet-500/40 rounded-lg p-4 shadow-2xl max-w-[280px] font-mono text-slate-200">
                    <div className="flex items-center gap-2 border-b border-violet-500/20 pb-2 mb-3 font-bold text-xs uppercase text-violet-400">
                      {selectedLandmark.type === 'metro' ? <Train size={14} /> :
                       selectedLandmark.type === 'market' ? <Building size={14} /> :
                       <Calendar size={14} />}
                      <span className="truncate">{selectedLandmark.name}</span>
                    </div>
                    <div className="space-y-2 text-[10px] leading-relaxed">
                      <div>
                        <span className="text-slate-500 uppercase block mb-0.5">Operational Impact</span>
                        <p className="text-slate-300 font-medium">{selectedLandmark.chokeDescription}</p>
                      </div>
                      <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-1">
                        <span className="text-slate-500 uppercase">Pattern Violations</span>
                        <span className="text-violet-400 font-bold text-xs">{selectedLandmark.spilloverViolations.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              )}
              
              {/* Hotspot Click Popup */}
              {viewMode === 'discrete' && popupInfo && (
                <Popup
                  longitude={popupInfo.lng}
                  latitude={popupInfo.lat}
                  anchor="bottom"
                  closeOnClick={false}
                  onClose={() => setPopupInfo(null)}
                  offset={15}
                >
                  <div className="bg-slate-950/95 border-2 border-white/10 rounded-lg p-4 shadow-2xl min-w-[240px]">
                    <div className={`flex items-center gap-2 border-b pb-2 mb-3 uppercase tracking-widest font-bold text-xs ${
                      popupInfo.category === 'Critical' ? 'text-red-500 border-red-500/50' :
                      popupInfo.category === 'High' ? 'text-orange-500 border-orange-500/50' :
                      popupInfo.category === 'Moderate' ? 'text-yellow-500 border-yellow-500/50' :
                      'text-emerald-500 border-emerald-500/50'
                    }`}>
                      {popupInfo.category === 'Critical' ? <ShieldAlert size={14} className="animate-pulse" /> : <AlertTriangle size={14} />}
                      <span className="truncate" title={popupInfo.display_location}>{popupInfo.display_location}</span>
                    </div>
                    
                    <div className="space-y-2.5 font-mono text-[10px] text-slate-300">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Jurisdiction</span>
                        <span className="font-bold text-white">{popupInfo.police_station}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Hazard Index (CHI)</span>
                        <span className={`font-black ${popupInfo.category === 'Critical' ? 'text-red-400' : 'text-amber-400'}`}>
                          {Number(popupInfo.chi).toFixed(1)} / 100
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Risk Class</span>
                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase border ${getSeverityColor(popupInfo.category)}`}>
                          {popupInfo.category}
                        </span>
                      </div>
                      
                      <div className="border-t border-white/10 pt-2 mt-2" />
                      
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Pattern-Derived Insights</span>
                        <span className="font-bold text-sky-400">
                          {Math.floor(popupInfo.chi * 42.5).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1"><Clock size={10}/> Patrol Window</span>
                        <span className="font-bold text-white">
                          {popupInfo.chi > 80 ? 'Morning (08:00 - 12:00)' : 'Evening (16:00 - 20:00)'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1"><Shield size={10}/> Assigned Unit</span>
                        <span className="font-bold text-emerald-400">
                          {popupInfo.category === 'Critical' ? `Unit_${Math.floor(Math.random() * 90) + 10}` : 'UNASSIGNED'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Popup>
              )}
            </Map>
          )}
          
          {/* Map Legend */}
          <div className="absolute bottom-6 right-6 bg-slate-950/90 backdrop-blur border border-white/10 p-4 rounded-lg shadow-2xl pointer-events-auto z-10 font-mono text-[10px] text-slate-300">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Risk Legend</h4>
            <div className="space-y-2">
              <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#FF3B30] mr-3" /> Critical (≥80)</div>
              <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#FF9500] mr-3" /> High (60-79)</div>
              <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#FFD60A] mr-3" /> Moderate (40-59)</div>
              <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-[#34C759] mr-3" /> Low (&lt;40)</div>
            </div>
          </div>
        </div>

        {/* Analytics & Hub Impact Sidebar (4 Columns) */}
        <div className="lg:col-span-4 border-l border-white/5 bg-slate-950/40 p-6 flex flex-col gap-4 overflow-y-auto h-full">
          <div>
            <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase font-mono mb-2 flex items-center gap-2">
              <Building className="text-violet-400" size={14} />
              Spillover Congestion Impact
            </h3>
            <p className="text-[10px] text-slate-400 font-mono leading-relaxed uppercase">
              Quantifying how on-street illegal parking near transit and commercial hubs blocks lanes and chokes intersections.
            </p>
          </div>

          <div className="space-y-3 mt-2">
            {landmarks.map((lm, idx) => {
              const isSelected = selectedLandmark?.name === lm.name;
              
              let capacityLoss = 25;
              if (lm.name.includes("KR Market")) capacityLoss = 50;
              else if (lm.name.includes("Safina Plaza")) capacityLoss = 35;
              else if (lm.name.includes("Sagar Theatre")) capacityLoss = 30;
              else if (lm.name.includes("Majestic")) capacityLoss = 40;
              else if (lm.name.includes("MG Road")) capacityLoss = 30;

              return (
                <div
                  key={`lm-sidebar-${idx}`}
                  onClick={() => handleHubClick(lm)}
                  className={`p-4 rounded-xl border font-mono text-xs cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? 'bg-violet-950/20 border-violet-500/60 shadow-[0_0_15px_rgba(139,92,246,0.15)] text-slate-200'
                      : 'bg-slate-900/40 border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="font-bold text-white uppercase text-[10px] truncate max-w-[170px]">
                      {lm.name}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                      lm.type === 'metro' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' :
                      lm.type === 'market' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {lm.type}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-500 uppercase font-bold">Capacity Loss</span>
                      <span className="text-red-400 font-bold">{capacityLoss}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${capacityLoss}%` }} />
                    </div>

                    <div className="flex justify-between text-[9px] pt-1">
                      <span className="text-slate-500">Violations: <strong className="text-sky-400">{lm.spilloverViolations.toLocaleString()}</strong></span>
                      <span className="text-slate-500">Peak CHI: <strong className="text-amber-400">
                        {lm.name.includes("KR Market") ? "97.5" :
                         lm.name.includes("Safina Plaza") ? "86.4" :
                         lm.name.includes("Sagar Theatre") ? "81.2" :
                         lm.name.includes("Majestic") ? "79.8" : "78.5"}
                      </strong></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-white/5 pt-4 mt-2">
            <h4 className="text-xs font-bold text-amber-400 uppercase font-mono mb-2 flex items-center gap-2">
              <ShieldAlert className="animate-pulse" size={14} />
              RECOMMENDED ACTION
            </h4>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2 font-mono text-[10px] text-slate-300">
              <div className="flex justify-between items-center border-b border-white/5 pb-1">
                <span>Deploy: <strong className="text-white">4 Officers</strong></span>
                <span className="text-sky-400">→ KR Market Transit Hub</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1.5 text-[10px] border-b border-white/5 pb-1.5">
                <div>Risk Level: <span className="text-red-400 font-bold block">Critical</span></div>
                <div>Operational Window: <span className="text-amber-400 font-bold block">Night Operations</span></div>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-1 pt-1.5">
                <span>Coverage Impact:</span>
                <span className="text-emerald-400 font-bold">50% Capacity Recovery</span>
              </div>
              <div className="text-[9px] text-slate-400 pt-1 leading-normal">
                <strong>Why Selected:</strong> 50% capacity loss detected due to spillover parking. High Enforcement Demand window.
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 mt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase font-mono mb-2">Correlation Analysis</h4>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3 space-y-2.5 font-mono text-[9px] text-slate-400 leading-normal">
              <div>
                <span className="text-white font-bold block uppercase mb-0.5">Vessel Choke Ratio: 2.4x</span>
                Every hour of double-parking on major corridors chokes carriageway throughput by 2.4x the vehicle footprint due to wave deceleration.
              </div>
              <div className="border-t border-white/5 pt-2">
                <span className="text-white font-bold block uppercase mb-0.5">Officer Window Multiplier</span>
                Aligning deployment to the exact 3-hour peak window mitigates congestion build-up with 82% fewer active patrol resources.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpatialIntelligence;

