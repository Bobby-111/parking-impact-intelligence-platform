import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

export const fetchKPIs = async () => {
  const res = await axios.get(`${API_URL}/kpis`);
  return res.data;
};

export const fetchSpatialData = async () => {
  const res = await axios.get(`${API_URL}/spatial`);
  return res.data;
};

export const fetchProjectedRisk = async () => {
  const res = await axios.get(`${API_URL}/projected-risk`);
  return res.data;
};

export const fetchEmerging = async () => {
  const res = await axios.get(`${API_URL}/emerging`);
  return res.data;
};

export const runOptimizer = async (officers: number) => {
  const res = await axios.post(`${API_URL}/optimizer?available_officers=${officers}`);
  return res.data;
};

export const fetchCriticalHotspots = async () => {
  const res = await axios.get(`${API_URL}/hotspots/critical`);
  return res.data;
};

export const fetchTimelineData = async () => {
  const res = await axios.get(`${API_URL}/timeline`);
  return res.data;
};

export const fetchHotspotDetail = async (id: string) => {
  const res = await axios.get(`${API_URL}/hotspot/${id}`);
  return res.data;
};

export const fetchHotspotRiskWindows = async (id: string) => {
  const res = await axios.get(`${API_URL}/hotspot/${id}/risk-windows`);
  return res.data;
};

export const fetchEHS = async (limit = 20, minEhs = 0) => {
  const res = await axios.get(`${API_URL}/ehs?limit=${limit}&min_ehs=${minEhs}`);
  return res.data;
};

export const askCopilotChat = async (message: string, replayEvent?: any) => {
  const res = await axios.post(`${API_URL}/copilot/chat`, { message, replay_event: replayEvent });
  return res.data;
};
