import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, Activity, Shield, Cpu, Lock, 
  LayoutGrid, Minimize2, Maximize2, X, 
  Search, Wifi, Battery, Command, FileText 
} from 'lucide-react';

// ============================================================================
// [MOCK] ACE 2.0 KERNEL BRIDGE (Simulating Python Core)
// ============================================================================

const NOAKernel = {
  version: "28.0.0 (Aegis)",
  bootLogs: [
    "ACE 2.0 Engine Initialized...",
    "Loading Sovereign v27 Policy Modules...",
    "Mounting Aegis Cryptographic Ledger...",
    "Verifying Merkle Root Hash: [ OK ]",
    "Starting NOA Kernel Services...",
    "System Ready."
  ],
  
  // Simulated Ledger State
  getLedgerStatus: () => ({
    integrity: "SECURE",
    hash: "a1b2c3d4..." + Math.floor(Math.random() * 9999),
    blocks: Math.floor(Date.now() / 1000) - 1700000000,
    threats_blocked: Math.floor(Math.random() * 5)
  }),

  // Simulated Policy Engine
  evaluateCommand: (cmd) => {
    const banned = ["rm -rf", "drop table", "system_halt"];
    if (banned.some(b => cmd.includes(b))) {
      return { 
        status: "BLOCKED", 
        msg: `[SOVEREIGN] Policy Violation Detected: '${cmd}' is banned.` 
      };
    }
    return { status: "ALLOW", msg: `Executing: ${cmd}` };
  }
};

// ============================================================================
// WINDOW MANAGER COMPONENTS
// ============================================================================

const WindowFrame = ({ title, icon: Icon, isOpen, isActive, onClose, children, style, onFocus }) => {
  if (!isOpen) return null;

  return (
    <div 
      onMouseDown={onFocus}
      className={`absolute flex flex-col rounded-xl overflow-hidden shadow-2xl transition-all duration-200 border border-white/10 backdrop-blur-xl ${isActive ? 'z-50 shadow-blue-500/20 ring-1 ring-white/20' : 'z-10 opacity-90'}`}
      style={{
        ...style,
        background: "rgba(15, 23, 42, 0.85)" 
      }}
    >
      {/* Title Bar */}
      <div className="h-10 bg-white/5 flex items-center justify-between px-4 select-none cursor-move handle">
        <div className="flex items-center gap-3 text-sm font-medium text-gray-200">
          <Icon size={16} className="text-blue-400" />
          {title}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500/50 hover:bg-yellow-500 cursor-pointer" />
          <div className="w-3 h-3 rounded-full bg-green-500/50 hover:bg-green-500 cursor-pointer" />
          <div 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            className="w-3 h-3 rounded-full bg-red-500/50 hover:bg-red-500 cursor-pointer" 
          />
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto p-4 text-gray-300">
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// APPS
// ============================================================================

const TerminalApp = () => {
  const [lines, setLines] = useState(["NOA OS v28.0 [Sovereign Shell]", "Type 'help' for commands."]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  const runCmd = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const newLines = [`root@aegis:~$ ${input}`];
    
    if (input === "clear") {
      setLines([]);
    } else if (input === "help") {
      newLines.push("Available: status, ledger, clear, [any command]");
    } else if (input === "status") {
      newLines.push("SYSTEM: NOMINAL", "KERNEL: ACTIVE", "POLICY: ENFORCED");
    } else if (input === "ledger") {
      newLines.push(`HEAD_HASH: ${NOAKernel.getLedgerStatus().hash}`);
    } else {
      const result = NOAKernel.evaluateCommand(input);
      if (result.status === "BLOCKED") {
         newLines.push(`❌ ${result.msg}`);
      } else {
         newLines.push(`✅ ${result.msg}`);
      }
    }

    setLines(prev => [...prev, ...newLines]);
    setInput("");
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  return (
    <div className="h-full font-mono text-sm flex flex-col">
      <div className="flex-1 space-y-1">
        {lines.map((l, i) => (
          <div key={i} className={l.includes("❌") ? "text-red-400" : l.includes("✅") ? "text-green-400" : "text-gray-300"}>
            {l}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={runCmd} className="mt-2 flex gap-2 text-green-400">
        <span>➜</span>
        <input 
          autoFocus 
          className="bg-transparent outline-none flex-1" 
          value={input} 
          onChange={e => setInput(e.target.value)} 
        />
      </form>
    </div>
  );
};

const DashboardApp = () => {
  const [data, setData] = useState(NOAKernel.getLedgerStatus());
  
  useEffect(() => {
    const i = setInterval(() => setData(NOAKernel.getLedgerStatus()), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="bg-white/5 p-4 rounded-lg border border-white/5">
        <div className="flex items-center gap-2 text-xs text-blue-400 mb-2">
          <Shield size={14} /> INTEGRITY STATUS
        </div>
        <div className="text-2xl font-bold text-white">{data.integrity}</div>
        <div className="text-xs text-gray-500 mt-1 font-mono">{data.hash}</div>
      </div>
      
      <div className="bg-white/5 p-4 rounded-lg border border-white/5">
        <div className="flex items-center gap-2 text-xs text-purple-400 mb-2">
          <Lock size={14} /> THREATS BLOCKED
        </div>
        <div className="text-2xl font-bold text-white">{data.threats_blocked}</div>
        <div className="text-xs text-gray-500 mt-1">Sovereign Engine Active</div>
      </div>

      <div className="col-span-2 bg-gradient-to-r from-blue-900/20 to-purple-900/20 p-4 rounded-lg border border-white/5 flex items-center justify-between">
         <div>
           <div className="text-xs text-gray-400">LEDGER BLOCKS</div>
           <div className="text-xl font-mono text-blue-200">{data.blocks.toLocaleString()}</div>
         </div>
         <Activity className="text-blue-500 animate-pulse" />
      </div>
    </div>
  );
};

// ============================================================================
// MAIN DESKTOP SHELL
// ============================================================================

export default function NOAWorkspace() {
  const [booting, setBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  
  const [windows, setWindows] = useState({
    terminal: { id: 'terminal', title: 'Kernel Terminal', icon: Terminal, isOpen: true, x: 50, y: 50, w: 500, h: 350, z: 10 },
    dashboard: { id: 'dashboard', title: 'Aegis Dashboard', icon: Activity, isOpen: true, x: 600, y: 100, w: 450, h: 300, z: 9 }
  });
  const [activeWin, setActiveWin] = useState('terminal');

  // Boot Sequence Effect
  useEffect(() => {
    if (bootStep < NOAKernel.bootLogs.length) {
      const timer = setTimeout(() => setBootStep(p => p + 1), 600);
      return () => clearTimeout(timer);
    } else {
      setTimeout(() => setBooting(false), 800);
    }
  }, [bootStep]);

  const focusWindow = (id) => {
    setActiveWin(id);
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], z: 50 },
      [Object.keys(prev).find(k => k !== id)]: { ...prev[Object.keys(prev).find(k => k !== id)], z: 10 }
    }));
  };

  if (booting) {
    return (
      <div className="h-screen w-full bg-black text-blue-500 font-mono p-10 flex flex-col justify-end">
        <div className="mb-10 text-4xl font-bold text-white tracking-tighter">NOA OS <span className="text-blue-600">v28.0</span></div>
        <div className="space-y-2">
          {NOAKernel.bootLogs.slice(0, bootStep).map((log, i) => (
            <div key={i} className="flex gap-4">
              <span className="text-gray-500">[{1000 + i * 45}]</span>
              <span>{log}</span>
            </div>
          ))}
          <div className="animate-pulse">_</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-900 relative overflow-hidden font-sans select-none text-gray-100">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black" />
      <div className="absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* Desktop Icons */}
      <div className="absolute top-6 left-6 flex flex-col gap-6">
        {Object.values(windows).map(win => (
          !win.isOpen && (
            <button key={win.id} onClick={() => setWindows(p => ({...p, [win.id]: {...win, isOpen: true}}))} className="group flex flex-col items-center gap-2">
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg group-hover:bg-white/10 transition-all group-hover:scale-105 backdrop-blur-md">
                <win.icon size={28} className="text-blue-400" />
              </div>
              <span className="text-xs font-medium text-gray-400 group-hover:text-white shadow-black drop-shadow-md">{win.title}</span>
            </button>
          )
        ))}
         <button className="group flex flex-col items-center gap-2">
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg group-hover:bg-white/10 transition-all group-hover:scale-105 backdrop-blur-md">
                <FileText size={28} className="text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-gray-400 group-hover:text-white shadow-black drop-shadow-md">License.key</span>
        </button>
      </div>

      {/* Windows */}
      {Object.values(windows).map(win => (
        <WindowFrame 
          key={win.id}
          {...win}
          icon={win.icon}
          isActive={activeWin === win.id}
          onFocus={() => focusWindow(win.id)}
          onClose={() => setWindows(p => ({...p, [win.id]: {...win, isOpen: false}}))}
          style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
        >
          {win.id === 'terminal' ? <TerminalApp /> : <DashboardApp />}
        </WindowFrame>
      ))}

      {/* Modern Dock (Not Windows Taskbar) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 h-16 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl flex items-center px-4 gap-2 shadow-2xl">
        <button className="p-3 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition-all mr-2 border border-blue-500/30">
          <LayoutGrid size={24} />
        </button>
        <div className="w-px h-8 bg-white/10 mx-1" />
        {Object.values(windows).map(win => (
          <button 
            key={win.id}
            onClick={() => {
              if (!win.isOpen) setWindows(p => ({...p, [win.id]: {...win, isOpen: true}}));
              focusWindow(win.id);
            }}
            className={`relative p-3 rounded-xl transition-all hover:bg-white/10 group ${win.isOpen ? 'bg-white/5' : ''}`}
          >
            <win.icon size={24} className={activeWin === win.id && win.isOpen ? "text-blue-400" : "text-gray-400"} />
            {win.isOpen && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />}
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">{win.title}</span>
          </button>
        ))}
      </div>

      {/* Status Bar (Top Right) */}
      <div className="absolute top-6 right-6 flex items-center gap-4 bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/5">
        <Wifi size={16} className="text-gray-400" />
        <Battery size={16} className="text-gray-400" />
        <span className="text-sm font-medium text-gray-300">NOA OS <span className="text-blue-500 text-xs bg-blue-500/10 px-1 rounded">PRO</span></span>
      </div>
    </div>
  );
}