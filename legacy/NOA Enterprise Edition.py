import React, { useState, useEffect } from 'react';
import { 
  Shield, Zap, Cpu, Activity, 
  Terminal, Power, Settings, Grid, 
  Download, Play, AlertTriangle, 
  CheckCircle, Server, Box, X, Minus, Square
} from 'lucide-react';

// ============================================================================
// SYSTEM KERNEL (Lightweight Host)
// ============================================================================

const SystemKernel = {
  cpuUsage: 5, // Idle
  memoryUsage: 12, // Lightweight
  modules: {
    ace: { installed: false, status: "OFFLINE", load: 0 },
    hpg: { installed: false, status: "OFFLINE", load: 0 }
  }
};

// ============================================================================
// APP: MODULE STORE (Install Heavy Engines)
// ============================================================================

const ModuleStore = ({ modules, onInstall }) => (
  <div className="p-6 text-gray-200">
    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
      <Grid className="text-blue-400" /> Enterprise Module Store
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      
      {/* ACE 2.0 CARD */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-3 hover:border-blue-500 transition-colors">
        <div className="flex justify-between items-start">
          <div className="bg-blue-500/20 p-3 rounded-lg">
            <Shield size={32} className="text-blue-400" />
          </div>
          <span className="bg-blue-500/10 text-blue-400 text-xs px-2 py-1 rounded border border-blue-500/20">SECURITY</span>
        </div>
        <div>
          <h3 className="font-bold text-lg">ACE 2.0 Guardian</h3>
          <p className="text-xs text-gray-400 mt-1">Real-time Semantic Validation Engine. Prevents hallucinations & logical bugs.</p>
        </div>
        <button 
          onClick={() => onInstall('ace')}
          disabled={modules.ace.installed}
          className={`mt-auto py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${modules.ace.installed ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
        >
          {modules.ace.installed ? <><CheckCircle size={16}/> Installed</> : <><Download size={16}/> Install (280MB)</>}
        </button>
      </div>

      {/* HPG 4.5 CARD */}
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-3 hover:border-purple-500 transition-colors">
        <div className="flex justify-between items-start">
          <div className="bg-purple-500/20 p-3 rounded-lg">
            <Zap size={32} className="text-purple-400" />
          </div>
          <span className="bg-purple-500/10 text-purple-400 text-xs px-2 py-1 rounded border border-purple-500/20">SIMULATION</span>
        </div>
        <div>
          <h3 className="font-bold text-lg">HPG 4.5 Studio</h3>
          <p className="text-xs text-gray-400 mt-1">Hyper-Process Generator with Merkle Integrity. Stack-safe iteration core.</p>
        </div>
        <button 
          onClick={() => onInstall('hpg')}
          disabled={modules.hpg.installed}
          className={`mt-auto py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 ${modules.hpg.installed ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
        >
          {modules.hpg.installed ? <><CheckCircle size={16}/> Installed</> : <><Download size={16}/> Install (12KB Core)</>}
        </button>
      </div>

    </div>
  </div>
);

// ============================================================================
// APP: HPG STUDIO (Heavy Workload)
// ============================================================================

const HPGStudio = ({ active }) => {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState(["Ready to initialize simulation..."]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (running && progress < 100) {
      const timer = setTimeout(() => {
        setProgress(p => p + 1);
        if (progress % 10 === 0) setLogs(prev => [`[HPG] Node_${Math.floor(Math.random()*1000)} generated...`, ...prev.slice(0, 5)]);
      }, 50);
      return () => clearTimeout(timer);
    } else if (progress >= 100) {
      setRunning(false);
      setLogs(prev => ["[SUCCESS] Merkle Root: a1b2c3d4...", ...prev]);
    }
  }, [running, progress]);

  if (!active) return <div className="h-full flex items-center justify-center text-gray-500">Service Suspended</div>;

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200">
      <div className="bg-purple-900/20 border-b border-purple-500/30 p-3 flex justify-between items-center">
        <div className="flex items-center gap-2 text-purple-400 font-bold">
          <Zap size={18} /> HPG 4.5 STUDIO
        </div>
        <div className="text-xs text-gray-500">v4.5.0 (ACE-Compliant)</div>
      </div>
      
      <div className="flex-1 p-4 flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-black/30 p-2 rounded border border-white/5">
            <div className="text-gray-500">DEPTH LIMIT</div>
            <div className="text-lg font-mono text-white">10,000</div>
          </div>
          <div className="bg-black/30 p-2 rounded border border-white/5">
            <div className="text-gray-500">NODES</div>
            <div className="text-lg font-mono text-purple-400">{running ? Math.floor(progress * 154) : 0}</div>
          </div>
          <div className="bg-black/30 p-2 rounded border border-white/5">
            <div className="text-gray-500">STATUS</div>
            <div className={running ? "text-lg text-yellow-400 animate-pulse" : "text-lg text-green-400"}>
              {running ? "RUNNING" : "IDLE"}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black font-mono text-xs p-2 rounded border border-white/10 overflow-hidden text-green-500/80">
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>

        <button 
          onClick={() => { setRunning(true); setProgress(0); }}
          disabled={running}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
        >
          <Play size={18} /> {running ? "SIMULATING..." : "START HYPER-PROCESS"}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// APP: ACE GUARDIAN (Security Layer)
// ============================================================================

const ACEGuardian = ({ active, targetStatus }) => {
  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200">
      <div className="bg-blue-900/20 border-b border-blue-500/30 p-3 flex justify-between items-center">
        <div className="flex items-center gap-2 text-blue-400 font-bold">
          <Shield size={18} /> ACE 2.0 GUARDIAN
        </div>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
           <span className="text-xs text-green-400">ACTIVE</span>
        </div>
      </div>

      <div className="p-6 flex flex-col items-center justify-center flex-1 gap-6">
        <div className="relative">
          <div className="w-32 h-32 rounded-full border-4 border-blue-500/30 flex items-center justify-center animate-[spin_10s_linear_infinite]">
             <div className="w-24 h-24 rounded-full border-t-4 border-blue-500" />
          </div>
          <Shield size={48} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400" />
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold">System Secure</h3>
          <p className="text-sm text-gray-400">Monitoring Process Integrity</p>
        </div>

        <div className="w-full bg-slate-800 rounded-lg p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Name Resolution</span>
            <span className="text-green-400 flex items-center gap-1"><CheckCircle size={10} /> PASS</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Type Flow</span>
            <span className="text-green-400 flex items-center gap-1"><CheckCircle size={10} /> PASS</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">HPG Integrity</span>
            <span className={targetStatus === 'RUNNING' ? "text-yellow-400 animate-pulse" : "text-green-400"}>
              {targetStatus === 'RUNNING' ? "VERIFYING..." : "SECURE"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN DESKTOP SHELL
// ============================================================================

export default function NOAEnterprise() {
  const [modules, setModules] = useState(SystemKernel.modules);
  const [windows, setWindows] = useState([
    { id: 'store', title: 'Module Store', icon: Grid, isOpen: true, active: true, w: 700, h: 450, x: 50, y: 50 },
    { id: 'ace', title: 'ACE Guardian', icon: Shield, isOpen: false, active: false, w: 350, h: 500, x: 800, y: 50 },
    { id: 'hpg', title: 'HPG Studio', icon: Zap, isOpen: false, active: false, w: 400, h: 500, x: 400, y: 150 }
  ]);
  const [topZ, setTopZ] = useState(10);

  const installModule = (id) => {
    setModules(prev => ({ ...prev, [id]: { ...prev[id], installed: true, status: "ONLINE" } }));
    setTimeout(() => openWindow(id), 500);
  };

  const openWindow = (id) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isOpen: true, active: true, z: topZ + 1 } : w));
    setTopZ(p => p + 1);
  };

  const closeWindow = (id) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isOpen: false } : w));
  };

  const focusWindow = (id) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, z: topZ + 1 } : w));
    setTopZ(p => p + 1);
  };

  return (
    <div className="h-screen w-full bg-slate-950 relative overflow-hidden font-sans select-none">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-black" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />

      {/* Taskbar */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-slate-900 border-b border-white/5 flex items-center px-4 justify-between z-50">
        <div className="flex items-center gap-4">
          <span className="font-bold text-white tracking-widest text-sm flex items-center gap-2">
            <Box size={16} className="text-blue-500" /> NOA <span className="text-gray-500 font-normal">ENTERPRISE</span>
          </span>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1 hover:text-white cursor-pointer"><Cpu size={12}/> CPU {modules.hpg.status === "ONLINE" && windows.find(w => w.id==='hpg' && w.isOpen) ? "45%" : "4%"}</span>
            <span className="flex items-center gap-1 hover:text-white cursor-pointer"><Activity size={12}/> MEM {modules.ace.status === "ONLINE" ? "1.2GB" : "400MB"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"/> ONLINE</div>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Desktop Area */}
      <div className="absolute inset-0 top-10 p-6">
        {/* Windows */}
        {windows.map(win => win.isOpen && (
          <div
            key={win.id}
            onMouseDown={() => focusWindow(win.id)}
            style={{ 
              left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z || 10,
              display: win.isOpen ? 'flex' : 'none'
            }}
            className="absolute flex-col bg-slate-800 rounded-lg shadow-2xl border border-white/10 overflow-hidden"
          >
            {/* Window Title Bar */}
            <div className="h-8 bg-slate-900 flex items-center justify-between px-3 handle cursor-move border-b border-white/5">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <win.icon size={12} className={win.id === 'ace' ? 'text-blue-400' : win.id === 'hpg' ? 'text-purple-400' : 'text-gray-400'} />
                {win.title}
              </div>
              <div className="flex gap-2">
                 <button onClick={() => closeWindow(win.id)} className="hover:text-red-400 text-gray-500"><X size={12} /></button>
              </div>
            </div>
            
            {/* Window Content */}
            <div className="flex-1 overflow-auto bg-slate-900/50">
              {win.id === 'store' && <ModuleStore modules={modules} onInstall={installModule} />}
              {win.id === 'ace' && <ACEGuardian active={true} targetStatus={windows.find(w=>w.id==='hpg')?.active ? 'RUNNING' : 'IDLE'} />}
              {win.id === 'hpg' && <HPGStudio active={true} />}
            </div>
          </div>
        ))}
      </div>

      {/* Dock */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl flex gap-2 shadow-2xl z-50">
         <button onClick={() => openWindow('store')} className="p-2 rounded-lg hover:bg-white/10 transition group relative">
            <Grid className="text-gray-300 group-hover:text-white" />
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap">Store</span>
         </button>
         <div className="w-px bg-white/10 mx-1" />
         
         {/* ACE Icon */}
         <button onClick={() => modules.ace.installed && openWindow('ace')} className={`p-2 rounded-lg transition group relative ${modules.ace.installed ? 'hover:bg-blue-500/20' : 'opacity-30 cursor-not-allowed'}`}>
            <Shield className={modules.ace.installed ? "text-blue-400" : "text-gray-500"} />
            {modules.ace.installed && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full" />}
         </button>

         {/* HPG Icon */}
         <button onClick={() => modules.hpg.installed && openWindow('hpg')} className={`p-2 rounded-lg transition group relative ${modules.hpg.installed ? 'hover:bg-purple-500/20' : 'opacity-30 cursor-not-allowed'}`}>
            <Zap className={modules.hpg.installed ? "text-purple-400" : "text-gray-500"} />
            {modules.hpg.installed && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-500 rounded-full" />}
         </button>
      </div>
    </div>
  );
}