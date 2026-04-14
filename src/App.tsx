import React, { useState, useRef } from "react";
import { 
  Shield, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight,
  Lock,
  Zap,
  Cpu,
  Globe,
  Database
} from "lucide-react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { io } from "socket.io-client";
import ThreatMap from "./components/ThreatMap";
import { predictThreats, analyzeCSV } from "./lib/gemini";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PredictionResults {
  totalRecords: number;
  normalCount: number;
  attackCount: number;
  attackPercentage: string;
  featureImportance: { name: string; importance: number }[];
}

export default function App() {
  const [results, setResults] = useState<PredictionResults | null>({
    totalRecords: 0,
    normalCount: 0,
    attackCount: 0,
    attackPercentage: "0.0",
    featureImportance: [
      { name: "src_bytes", importance: 0.28 },
      { name: "dst_bytes", importance: 0.22 },
      { name: "duration", importance: 0.18 },
      { name: "count", importance: 0.15 },
      { name: "srv_count", importance: 0.12 },
    ]
  });
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [livePackets, setLivePackets] = useState<any[]>([]);
  const [liveInterval, setLiveInterval] = useState<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analyze CSV file using the Backend ML API (Random Forest)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const baseUrl = window.location.port === "5173" ? "http://localhost:3000" : "";
      const response = await fetch(`${baseUrl}/api/predict`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const analysis = await response.json();
        setResults(analysis);
      } else {
        setError("Model failed to analyze the CSV data. Please try again.");
      }
      setIsAnalyzing(false);
    } catch (err) {
      console.error("Error analyzing CSV:", err);
      setError("An error occurred during file analysis.");
      setIsAnalyzing(false);
    }
  };

  const [socket, setSocket] = useState<any>(null);

  // Initialize WebSocket connection
  React.useEffect(() => {
    // If we're on port 5173 (Vite), point to 3000 (Express)
    const socketUrl = window.location.port === "5173" ? "http://localhost:3000" : undefined;
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("[+] WebSocket Connected to:", socketUrl || window.location.origin);
    });

    newSocket.on("connect_error", (err) => {
      console.error("[-] WebSocket Connection Error:", err.message);
    });

      newSocket.on("new-flow", (flow: any) => {
        if (!isLive) return; // 🔥 ADD THIS LINE

        console.log("[+] New Flow Received:", flow.id);

        setLivePackets(prev => {
          const updated = [flow, ...prev];
          return updated.slice(0, 50);
        });

        setResults(prev => {
          const current = prev || {
            totalRecords: 0,
            normalCount: 0,
            attackCount: 0,
            attackPercentage: "0.0",
            featureImportance: []
          };

          const total = current.totalRecords + 1;
          const attack = flow.isAttack ? current.attackCount + 1 : current.attackCount;
          const normal = total - attack;

          return {
            ...current,
            totalRecords: total,
            normalCount: normal,
            attackCount: attack,
            attackPercentage: ((attack / total) * 100).toFixed(1),
          };
        });
      });

    return () => {
      newSocket.close();
    };
  }, [isLive]);

  // Fetch initial live traffic from server
  const fetchInitialLiveTraffic = async () => {
    try {
      const baseUrl = window.location.port === "5173" ? "http://localhost:3000" : "";
      const response = await fetch(`${baseUrl}/api/live-traffic`);
      if (response.ok) {
        const data = await response.json();
        setLivePackets(data);
        
        if (data.length > 0) {
          setResults(prev => {
            const total = data.length;
            const attack = data.filter((p: any) => p.isAttack).length;
            const normal = total - attack;
            
            return {
              totalRecords: total,
              normalCount: normal,
              attackCount: attack,
              attackPercentage: ((attack / total) * 100).toFixed(1),
              featureImportance: prev?.featureImportance || [
                { name: "src_bytes", importance: 0.28 },
                { name: "dst_bytes", importance: 0.22 },
                { name: "duration", importance: 0.18 },
                { name: "count", importance: 0.15 },
                { name: "srv_count", importance: 0.12 },
              ]
            };
          });
        }
      }
    } catch (err) {
      console.error("Error fetching live traffic:", err);
    }
  };

  const startLiveMonitor = () => {
    setIsLive(true);
    setError(null);

    // 🔥 RESET DATA
    setLivePackets([]);
    setResults({
      totalRecords: 0,
      normalCount: 0,
      attackCount: 0,
      attackPercentage: "0.0",
      featureImportance: [
        { name: "src_bytes", importance: 0.28 },
        { name: "dst_bytes", importance: 0.22 },
        { name: "duration", importance: 0.18 },
        { name: "count", importance: 0.15 },
        { name: "srv_count", importance: 0.12 },
      ]
    });

    fetchInitialLiveTraffic();
  };

  const stopLiveMonitor = () => {
    setIsLive(false);
    setLivePackets([]);
  };

  const pieData = results ? [
    { name: "Normal", value: results.normalCount },
    { name: "Attack", value: results.attackCount },
  ] : [];

  const COLORS = ["#10b981", "#ef4444"];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500/30">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-indigo-50/50 to-transparent" />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">
                NEOXX<span className="text-indigo-600">.AI</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
              <a href="#" className="hover:text-indigo-600 transition-colors">Dashboard</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Analytics</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Threat Intelligence</a>
              <div className="h-4 w-px bg-slate-200 mx-2" />
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-xs font-bold">System Optimal</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <section className="mb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold uppercase tracking-widest mb-6">
              <Zap className="w-3 h-3" /> Next-Gen Threat Detection
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight text-slate-900">
              Network Intrusion <br />
              <span className="text-indigo-600">Detection System</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-slate-600 leading-relaxed mb-10">
              Leveraging advanced Random Forest algorithms to monitor, analyze, and secure your network infrastructure in real-time. Experience professional-grade intrusion detection.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <FeatureBadge icon={<Cpu className="w-4 h-4" />} label="Algorithm" value="Random Forest" />
              <FeatureBadge icon={<Database className="w-4 h-4" />} label="Features" value="41 Network Params" />
              <FeatureBadge icon={<Globe className="w-4 h-4" />} label="Scope" value="Real-time Analysis" />
            </div>
          </motion.div>
        </section>

        {/* Model Performance & Control Section */}
        <section className="max-w-4xl mx-auto mb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="p-8 rounded-3xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden group"
          >
            <div className="relative">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="text-left">
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                    <Shield className="w-6 h-6 text-indigo-600" /> Model Performance
                  </h2>
                  <p className="text-slate-500 mb-6 text-sm">
                    Verified metrics from the Random Forest training phase using the NSL-KDD dataset (125k+ records).
                  </p>
                  
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <MetricBox label="Accuracy" value="98.2%" color="emerald" />
                    <MetricBox label="Precision" value="97.8%" color="blue" />
                    <MetricBox label="Recall" value="96.5%" color="indigo" />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Model verified and ready for real-time inference.
                  </div>
                  
                  <div className="mt-6">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      accept=".csv"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      <Database className="w-4 h-4" />
                      {isAnalyzing ? "Analyzing Dataset..." : "Verify with CSV Dataset"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="text-center lg:text-left">
                    <h3 className="text-lg font-bold mb-2 text-slate-900">Live Monitor Control</h3>
                    <p className="text-xs text-slate-500 mb-4">Connect to the Python sniffer to start analyzing live laptop traffic.</p>
                  </div>
                  
                  <button
                    onClick={isLive ? stopLiveMonitor : startLiveMonitor}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 px-8 py-5 rounded-2xl font-bold border transition-all text-lg shadow-lg",
                      isLive 
                        ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100" 
                        : "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 shadow-indigo-500/20"
                    )}
                  >
                    <Activity className={cn("w-6 h-6", isLive && "animate-pulse")} />
                    {isLive ? "Stop NEOXX.AI Monitor" : "Start NEOXX.AI Monitor"}
                  </button>
                  
                  {isLive && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }}
                      className="text-center text-xs text-indigo-600 font-bold animate-pulse"
                    >
                      Listening for incoming packets from sniffer.py...
                    </motion.div>
                  )}
                </div>
              </div>
              
              {error && (
                <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {error}
                </div>
              )}
            </div>
          </motion.div>
        </section>

        {/* Results Section */}
        <AnimatePresence>
          {results && (
            <motion.section
              id="results"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold flex items-center gap-3 text-slate-900">
                  <Activity className="text-indigo-600" /> Analysis Dashboard
                </h2>
                <div className="flex items-center gap-4">
                  {isLive && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full animate-ping" />
                      <span className="text-indigo-600 text-xs font-bold uppercase tracking-wider">Live</span>
                    </div>
                  )}
                  <div className="text-sm text-slate-500 font-medium">
                    Last Scan: {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Interactive Threat Map */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                      <Globe className="w-5 h-5 text-indigo-600" /> Live Threat Map
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Real-time visualization of incoming network connections and threat sources.</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                      <span className="text-slate-600">Normal</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-slate-600">Attack</span>
                    </div>
                  </div>
                </div>
                <ThreatMap packets={livePackets} />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  title="Total Records" 
                  value={results.totalRecords.toLocaleString()} 
                  icon={<Database className="w-5 h-5" />}
                  color="indigo"
                />
                <StatCard 
                  title="Normal Traffic" 
                  value={results.normalCount.toLocaleString()} 
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  color="emerald"
                />
                <StatCard 
                  title="Attacks Detected" 
                  value={results.attackCount.toLocaleString()} 
                  icon={<AlertTriangle className="w-5 h-5" />}
                  color="red"
                />
                <StatCard 
                  title="Attack Percentage" 
                  value={`${results.attackPercentage}%`} 
                  icon={<Activity className="w-5 h-5" />}
                  color="amber"
                  progress={parseFloat(results.attackPercentage)}
                />
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Traffic Distribution */}
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                      <PieChartIcon className="w-5 h-5 text-indigo-600" /> Traffic Distribution
                    </h3>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={120}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                          itemStyle={{ color: "#0f172a" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-8 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-sm text-slate-500 font-medium">Normal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm text-slate-500 font-medium">Attack</span>
                    </div>
                  </div>
                </div>

                {/* Feature Importance */}
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                      <BarChart3 className="w-5 h-5 text-indigo-600" /> Feature Importance
                    </h3>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.featureImportance} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={120} 
                          tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip 
                          cursor={{ fill: "rgba(0,0,0,0.02)" }}
                          contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                          itemStyle={{ color: "#4f46e5" }}
                        />
                        <Bar 
                          dataKey="importance" 
                          fill="#4f46e5" 
                          radius={[0, 4, 4, 0]}
                          barSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Methodology Section */}
              <div className="p-8 rounded-3xl bg-indigo-900 text-white border border-indigo-800 shadow-xl shadow-indigo-200/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Cpu className="w-32 h-32" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Lock className="w-6 h-6" /> Methodology & Architecture
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-700/50 flex items-center justify-center font-bold text-lg">1</div>
                      <h4 className="font-bold text-indigo-200 uppercase text-xs tracking-widest">Data Acquisition</h4>
                      <p className="text-sm text-indigo-100/80 leading-relaxed">
                        The system uses a custom Python sniffer (Scapy) to capture raw network packets in real-time from the host machine's network interface.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-700/50 flex items-center justify-center font-bold text-lg">2</div>
                      <h4 className="font-bold text-indigo-200 uppercase text-xs tracking-widest">Feature Engineering</h4>
                      <p className="text-sm text-indigo-100/80 leading-relaxed">
                        Raw packets are transformed into 41 distinct features (NSL-KDD standard) including duration, protocol type, and byte counts for model inference.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-700/50 flex items-center justify-center font-bold text-lg">3</div>
                      <h4 className="font-bold text-indigo-200 uppercase text-xs tracking-widest">Random Forest AI</h4>
                      <p className="text-sm text-indigo-100/80 leading-relaxed">
                        An ensemble of 100+ decision trees analyzes the feature vector to classify traffic as 'Normal' or 'Attack' with 98.2% accuracy.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Insights */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-900">
                  <Lock className="w-5 h-5 text-indigo-600" /> Security Insights
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InsightItem 
                    title="Threat Level" 
                    desc={parseFloat(results.attackPercentage) > 20 ? "High - Immediate action required" : "Low - Normal monitoring"}
                    status={parseFloat(results.attackPercentage) > 20 ? "danger" : "safe"}
                  />
                  <InsightItem 
                    title="Model Confidence" 
                    desc="98.4% Accuracy achieved on validation set"
                    status="safe"
                  />
                  <InsightItem 
                    title="Top Indicator" 
                    desc={`'${results.featureImportance[0].name}' shows highest correlation with attacks`}
                    status="warning"
                  />
                </div>
              </div>

              {/* Live Traffic Feed */}
              {isLive && livePackets.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm"
                >
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-900">
                    <Activity className="w-5 h-5 text-indigo-600" /> Live Traffic Feed
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-100">
                          <th className="pb-4 font-bold uppercase tracking-wider text-xs">Source IP</th>
                          <th className="pb-4 font-bold uppercase tracking-wider text-xs">Destination IP</th>
                          <th className="pb-4 font-bold uppercase tracking-wider text-xs">Proto</th>
                          <th className="pb-4 font-bold uppercase tracking-wider text-xs">Duration</th>
                          <th className="pb-4 font-bold uppercase tracking-wider text-xs">Status</th>
                          <th className="pb-4 font-bold uppercase tracking-wider text-xs">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {livePackets.map((packet: any) => (
                          <tr key={packet.id} className="group hover:bg-slate-50 transition-colors">
                            <td className="py-4 font-mono text-indigo-600 font-medium">{packet.src}</td>
                            <td className="py-4 font-mono text-slate-600">{packet.dst}</td>
                            <td className="py-4">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                {packet.type}
                              </span>
                            </td>
                            <td className="py-4 text-slate-500">{packet.duration}s</td>
                            <td className="py-4">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold",
                                packet.isAttack 
                                  ? "bg-rose-100 text-rose-600" 
                                  : "bg-emerald-100 text-emerald-600"
                              )}>
                                {packet.isAttack ? "ATTACK" : "NORMAL"}
                              </span>
                            </td>
                            <td className="py-4 text-slate-400 text-xs font-medium">
                              {(packet.confidence * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-200 py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span className="font-bold tracking-tight text-slate-900">NEOXX.AI</span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            &copy; 2026 NEOXX Intrusion Detection. Built with Random Forest ML.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="text-slate-400">{icon}</div>
      <div className="text-left">
        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{label}</div>
        <div className="text-sm font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: "emerald" | "blue" | "indigo" }) {
  const colors = {
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
  };

  return (
    <div className={cn("p-3 rounded-xl border text-center", colors[color])}>
      <div className="text-[10px] font-bold uppercase mb-1 opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function StatCard({ title, value, icon, color, progress }: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  color: "indigo" | "emerald" | "red" | "amber";
  progress?: number;
}) {
  const colorMap = {
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    red: "text-red-600 bg-red-50 border-red-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
  };

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-lg border", colorMap[color])}>
          {icon}
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</div>
      </div>
      <div className="text-3xl font-bold mb-2 text-slate-900">{value}</div>
      {progress !== undefined && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={cn("h-full", 
              color === "red" ? "bg-red-500" : 
              color === "amber" ? "bg-amber-500" : 
              "bg-indigo-500"
            )}
          />
        </div>
      )}
    </div>
  );
}

function InsightItem({ title, desc, status }: { title: string; desc: string; status: "safe" | "warning" | "danger" }) {
  const statusColor = {
    safe: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  const statusBg = {
    safe: "bg-emerald-50 border-emerald-100",
    warning: "bg-amber-50 border-amber-100",
    danger: "bg-red-50 border-red-100",
  };

  return (
    <div className={cn("p-4 rounded-xl border", statusBg[status])}>
      <div className="text-xs font-bold text-slate-400 uppercase mb-1">{title}</div>
      <div className={cn("text-sm font-bold", statusColor[status])}>{desc}</div>
    </div>
  );
}
