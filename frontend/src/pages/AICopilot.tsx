import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '../components/GlassCard';
import { Bot, Send, MessageSquare, Sparkles, User, Loader2, MapPin, TrendingUp, ShieldCheck, AlertTriangle, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { askCopilotChat } from '../api';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}

interface EvidenceCard {
  title: string;
  value: string;
  description: string;
}

const AICopilot = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: "Welcome to the AI Risk Intelligence terminal. I have pre-loaded Bengaluru's spatiotemporal violation records, persistent risk zone analysis, critical risk windows, and enforcement demand trajectories. Ask me about persistent hotspots, which risk windows need urgent coverage, or how to deploy your officers most effectively.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceCard[]>([
    { title: "City Risk Index", value: "38 / 100", description: "System-wide average hazard index" },
    { title: "Peak Sector Risk", value: "84 / 100", description: "Highest hazard segment risk level" },
    { title: "System Status", value: "CRITICAL", description: "Enforcement patrols dispatched" }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const [isReplayActive, setIsReplayActive] = useState<boolean>(false);

  useEffect(() => {
    setIsReplayActive(sessionStorage.getItem('replayEnabled') === 'true');
  }, []);

  const suggestedQuestions = isReplayActive
    ? [
        "What is currently happening in replay?",
        "Why was this alert generated?",
        "Is this location a Persistent Risk Zone?",
        "What officer demand is recommended?"
      ]
    : [
        "Which junction should be prioritized tonight?",
        "Which zones require maximum officers?",
        "Show persistent risk zones.",
        "Why is KR Market ranked #1?",
        "Which police station has the highest risk?"
      ];

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsgId = msgCounter.current++;
    const userMsg: Message = {
      id: `user-${userMsgId}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      let replayEvent: any = null;
      if (isReplayActive) {
        const stored = sessionStorage.getItem('currentReplayEvent');
        if (stored) {
          try {
            replayEvent = JSON.parse(stored);
          } catch (e) {
            console.error('Error parsing stored replay event:', e);
          }
        }
      }

      const response = await askCopilotChat(textToSend, replayEvent);
      const botMsgId = msgCounter.current++;
      const botMsg: Message = {
        id: `bot-${botMsgId}`,
        sender: 'bot',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMsg]);
      if (response.evidence && response.evidence.length > 0) {
        setEvidence(response.evidence);
      }
    } catch (err) {
      console.error('Error in Copilot Chat:', err);
      const errorMsgId = msgCounter.current++;
      const errorMsg: Message = {
        id: `error-${errorMsgId}`,
        sender: 'bot',
        text: "Apologies, I encountered a communication drop with the analytical engine. Please try querying again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const getEvidenceIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('junction') || t.includes('market') || t.includes('ground') || t.includes('cell') || t.includes('station')) {
      return <MapPin className="text-red-400" size={18} />;
    }
    if (t.includes('coverage') || t.includes('protect') || t.includes('officer') || t.includes('unit') || t.includes('deploy')) {
      return <ShieldCheck className="text-sky-400" size={18} />;
    }
    if (t.includes('risk') || t.includes('status') || t.includes('chi') || t.includes('warning') || t.includes('hazard')) {
      return <AlertTriangle className="text-amber-500 animate-pulse" size={18} />;
    }
    if (t.includes('recurrence') || t.includes('rate') || t.includes('gain') || t.includes('trend') || t.includes('share') || t.includes('percent')) {
      return <TrendingUp className="text-emerald-400" size={18} />;
    }
    return <FileText className="text-slate-400" size={18} />;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col min-h-0">
      
      {/* Header Info */}
      <div className="mb-6 flex-shrink-0 flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-mono font-black tracking-widest text-white uppercase flex items-center gap-3">
            <Bot className="text-sky-400" size={28} />
            AI Decision Support Copilot
          </h1>
          <p className="text-xs text-slate-400 font-semibold tracking-wider font-mono uppercase mt-0.5">
            Spatiotemporal Risk Intelligence · Persistent Hotspot Analysis · Enforcement Demand Engine
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 rounded-full">
          <Sparkles className="text-sky-400 animate-spin" size={14} style={{ animationDuration: '4s' }} />
          <span className="text-[10px] font-mono font-bold tracking-wider text-sky-400 uppercase">
            GEMINI-FLASH ACTIVE
          </span>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Column: Interactive Chat Terminal (7 cols) */}
        <div className="lg:col-span-8 flex flex-col h-full min-h-0 bg-slate-900/20 border border-white/5 rounded-xl overflow-hidden shadow-2xl relative">
          
          {/* Chat Messages Scrolling Feed */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border ${
                  msg.sender === 'user' 
                    ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' 
                    : 'bg-slate-950 border-white/10 text-slate-400'
                }`}>
                  {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>

                <div className={`flex flex-col gap-1.5`}>
                  <div className={`p-4 rounded-2xl text-xs font-mono border leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-sky-500/10 border-sky-500/20 text-slate-200 rounded-tr-none'
                      : 'bg-slate-950/60 border-white/5 text-slate-300 rounded-tl-none'
                  }`}>
                    {msg.text.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">
                        {line}
                      </p>
                    ))}
                  </div>
                  <span className={`text-[9px] font-mono text-slate-600 px-1 ${msg.sender === 'user' ? 'text-right' : ''}`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-slate-950 border border-white/10 text-slate-400">
                  <Bot size={14} />
                </div>
                <div className="bg-slate-950/60 border border-white/5 p-4 rounded-2xl rounded-tl-none flex items-center gap-2 text-xs font-mono text-slate-500">
                  <Loader2 className="animate-spin text-sky-400" size={14} />
                  <span>Synthesizing dataset analytics...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Quick-select Suggested Questions */}
          <div className="px-5 py-3 bg-slate-950/40 border-t border-white/5 flex flex-wrap gap-2 items-center flex-shrink-0">
            <span className="text-[10px] font-bold font-mono tracking-widest text-slate-500 uppercase mr-1 flex items-center gap-1.5">
              <MessageSquare size={10} /> Suggested:
            </span>
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                disabled={loading}
                onClick={() => handleSendMessage(q)}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white rounded-full font-mono text-[10px] font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Chat Form Area */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="p-4 bg-slate-950/80 border-t border-white/5 flex gap-3 items-center flex-shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
              placeholder="Ask about persistent risk zones, critical risk windows, or enforcement demand..."
              className="flex-1 bg-slate-900 border border-white/10 rounded-lg py-2.5 px-4 font-mono text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="p-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 border border-white/10 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </form>

        </div>

        {/* Right Column: Dynamic Supporting Evidence Panel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-0 gap-4">
          <GlassCard className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-4 flex-shrink-0">
              <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2 font-mono">
                <Sparkles className="text-sky-400" size={14} />
                Supporting Analytics
              </h3>
              <span className="text-[9px] font-mono px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded-full font-bold">XAI EVIDENCE</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <p className="text-[10px] font-mono text-slate-500 leading-relaxed uppercase tracking-wider mb-2 font-semibold">
                Contextual evidence mapped from user query:
              </p>
              
              {evidence.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02, x: 5, backgroundColor: 'rgba(14, 165, 233, 0.05)', borderColor: 'rgba(14, 165, 233, 0.3)' }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-slate-950/40 p-4 border border-white/5 hover:border-white/10 rounded-lg flex gap-3 font-mono text-xs transition-all cursor-default"
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {getEvidenceIcon(card.title)}
                  </div>
                  <div className="space-y-1">
                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                      {card.title}
                    </div>
                    <div className="text-white text-sm font-black">
                      {card.value}
                    </div>
                    <div className="text-slate-400 text-[11px] leading-relaxed">
                      {card.description}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            
            <div className="border-t border-white/5 pt-3 mt-4 text-[9px] font-mono text-slate-500 uppercase tracking-widest flex-shrink-0 space-y-1">
              <div className="text-sky-500 font-bold">Source: CHI Engine, Hotspot Cells Dataset, Spatiotemporal Risk Matrix</div>
              <div>Validated using live operational analytics backend.</div>
            </div>
          </GlassCard>
        </div>

      </div>

    </div>
  );
};

export default AICopilot;
