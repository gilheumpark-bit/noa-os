import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Activity, 
  Settings, 
  FileText, 
  Cpu, 
  Minus, 
  X, 
  Square, 
  Search, 
  Wifi, 
  Battery, 
  LayoutGrid 
} from 'lucide-react';

// ============================================================================
// ACE 2.0 KERNEL SIMULATION (Previous Logic Integrated)
// ============================================================================

interface SystemStatus {
  cpu: number;
  memory: number;
  tasks: number;
}

const KernelSimulator = {
  boot: () => ({ status: 'ONLINE', version: 'NOA v28.0 (Aegis)' }),
  processCommand: (cmd: string): string => {
    const command = cmd.trim().toLowerCase();
    if (command === 'help') return 'Available commands: status, clear, ver, reboot, ace-audit';
    if (command === 'status') return 'SYSTEM: NOMINAL\nKERNEL: ACTIVE\nPOLICY: ENFORCED';
    if (command === 'ver') return 'NOA OS v28.0 [ACE 2.0 Compliant]';
    if (command === 'ace-audit') return 'ACE 2.0 AUDIT: PASS\nINTEGRITY: 100%';
    if (command === '') return '';
    return `Unknown command: ${cmd}`;
  },
  getStatus: (): SystemStatus => ({
    cpu: Math.floor(Math.random() * 30) + 10,
    memory: Math.floor(Math.random() * 40) + 20,
    tasks: Math.floor(Math.random() * 5) + 45
  })
};

// ============================================================================
// WINDOW MANAGER TYPES
// ============================================================================

interface WindowState {
  id: string;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  content: React.ReactNode;
  zIndex: number;
  icon: React.ReactNode;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

// ============================================================================
// APP COMPONENTS
// ============================================================================

// 1. Terminal App
const TerminalApp = () => {
  const [history, setHistory] = useState<string[]>(['NOA OS Kernel v28.0 initialized...', 'Type "help" for commands.']);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === 'clear') {
      setHistory([]);
      setInput('');
      return;
    }
    const output = KernelSimulator.processCommand(input);
    setHistory(prev => [...prev, `root@noa:~$ ${input}`, output]);
    setInput('');
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  return (
    <div className="h-full bg-black text-green-400 font-mono p-4 text-sm flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-1">
        {history.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">{line}</div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleRun} className="flex mt-2 border-t border-gray-700 pt-2">
        <span className="mr-2">root@noa:~$</span>
        <input 
          autoFocus
          className="bg-transparent border-none outline-none flex-1 text-green-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </form>
    </div>
  );
};

// 2. System Monitor App
const SystemMonitorApp = () => {
  const [stats, setStats] = useState<SystemStatus>(KernelSimulator.getStatus());
  const [history, setHistory] = useState<number[]>(new Array(20).fill(20));

  useEffect(() => {
    const timer = setInterval(() => {
      const newStats = KernelSimulator.getStatus();
      setStats(newStats);
      setHistory(prev => [...prev.slice(1), newStats.cpu]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-full bg-gray-900 text-white p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">CPU LOAD</div>
          <div className="text-3xl font-bold text-blue-400">{stats.cpu}%</div>
          <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${stats.cpu}%` }} />
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-xs mb-1">MEMORY</div>
          <div className="text-3xl font-bold text-purple-400">{stats.memory}%</div>
          <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${stats.memory}%` }} />
          </div>
        </div>
      </div>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 h-32 flex items-end space-x-1">
        {history.map((h, i) => (
          <div key={i} className="flex-1 bg-blue-500/20 rounded-t-sm relative group">
             <div 
               className="absolute bottom-0 w-full bg-blue-500 rounded-t-sm transition-all duration-300" 
               style={{ height: `${h}%` }}
             />
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500 text-center">ACE 2.0 HARDWARE ABSTRACTION LAYER</div>
    </div>
  );
};

// ============================================================================
// DESKTOP OS SHELL
// ============================================================================

export default function NOADesktop() {
  const [windows, setWindows] = useState<WindowState[]>([
    {
      id: 'terminal',
      title: 'NOA Terminal',
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      content: <TerminalApp />,
      zIndex: 10,
      icon: <Terminal size={18} />,
      position: { x: 50, y: 50 },
      size: { w: 600, h: 400 }
    },
    {
      id: 'monitor',
      title: 'System Monitor',
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      content: <SystemMonitorApp />,
      zIndex: 9,
      icon: <Activity size={18} />,
      position: { x: 100, y: 100 },
      size: { w: 500, h: 450 }
    }
  ]);

  const [activeId, setActiveId] = useState<string>('terminal');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Window Operations
  const bringToFront = (id: string) => {
    setActiveId(id);
    setWindows(prev => prev.map(w => ({
      ...w,
      zIndex: w.id === id ? 50 : 10
    })));
  };

  const toggleWindow = (id: string) => {
    setWindows(prev => prev.map(w => {
      if (w.id === id) {
        if (!w.isOpen) return { ...w, isOpen: true, isMinimized: false, zIndex: 50 };
        if (w.isMinimized) return { ...w, isMinimized: false, zIndex: 50 };
        return { ...w, isMinimized: true };
      }
      return w;
    }));
    setActiveId(id);
  };

  const closeWindow = (id: string) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isOpen: false } : w));
  };

  const maximizeWindow = (id: string) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
  };

  // Drag Logic (Simplified)
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    bringToFront(id);
    const win = windows.find(w => w.id === id);
    if (!win || win.isMaximized) return;

    const startX = e.clientX - win.position.x;
    const startY = e.clientY - win.position.y;

    const handleMouseMove = (ev: MouseEvent) => {
      setWindows(prev => prev.map(w => {
        if (w.id === id) {
          return {
            ...w,
            position: { x: ev.clientX - startX, y: ev.clientY - startY }
          };
        }
        return w;
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="h-screen w-full bg-slate-900 overflow-hidden font-sans select-none relative">
      {/* Background Wallpaper */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-black pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] bg-cover opacity-20 pointer-events-none" />

      {/* Desktop Area */}
      <div className="absolute inset-0 p-6 flex flex-col items-start gap-4">
        {windows.map(app => (
          <button 
            key={app.id}
            onClick={() => toggleWindow(app.id)}
            className="group flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors w-24 text-center"
          >
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-lg group-hover:scale-105 transition-transform border border-white/5">
              <div className="text-blue-300">
                {app.id === 'terminal' ? <Terminal size={28} /> : <Activity size={28} />}
              </div>
            </div>
            <span className="text-xs text-white drop-shadow-md font-medium">{app.title}</span>
          </button>
        ))}
        
        {/* Mock File Icons */}
        <button className="group flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors w-24 text-center">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-lg group-hover:scale-105 transition-transform border border-white/5">
              <div className="text-yellow-300"><FileText size={28} /></div>
            </div>
            <span className="text-xs text-white drop-shadow-md font-medium">Readme.txt</span>
        </button>
      </div>

      {/* Windows Layer */}
      {windows.map(win => win.isOpen && !win.isMinimized && (
        <div 
          key={win.id}
          onMouseDown={() => bringToFront(win.id)}
          style={{ 
            zIndex: win.zIndex,
            left: win.isMaximized ? 0 : win.position.x,
            top: win.isMaximized ? 0 : win.position.y,
            width: win.isMaximized ? '100%' : win.size.w,
            height: win.isMaximized ? 'calc(100% - 48px)' : win.size.h,
          }}
          className={`absolute flex flex-col bg-slate-800/90 backdrop-blur-md rounded-lg shadow-2xl border border-white/10 overflow-hidden transition-all duration-200 ${win.isMaximized ? 'rounded-none border-0' : ''}`}
        >
          {/* Title Bar */}
          <div 
            onMouseDown={(e) => handleDragStart(e, win.id)}
            className={`h-9 flex items-center justify-between px-3 bg-white/5 select-none ${win.isMaximized ? '' : 'cursor-default'}`}
          >
            <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
              {win.icon} <span>{win.title}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={(e) => {e.stopPropagation(); toggleWindow(win.id)}} className="p-1.5 hover:bg-white/10 rounded"><Minus size={14} className="text-white" /></button>
              <button onClick={(e) => {e.stopPropagation(); maximizeWindow(win.id)}} className="p-1.5 hover:bg-white/10 rounded"><Square size={12} className="text-white" /></button>
              <button onClick={(e) => {e.stopPropagation(); closeWindow(win.id)}} className="p-1.5 hover:bg-red-500 rounded group"><X size={14} className="text-white" /></button>
            </div>
          </div>

          {/* Window Content */}
          <div className="flex-1 overflow-hidden relative">
            {win.content}
          </div>
        </div>
      ))}

      {/* Taskbar */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-slate-900/80 backdrop-blur-lg border-t border-white/10 flex items-center px-4 justify-between z-[100]">
        
        {/* Start / Menu */}
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20">
            <LayoutGrid size={20} className="text-white" />
          </button>

          {/* Search Bar */}
          <div className="hidden md:flex items-center bg-white/5 rounded-full px-3 py-1.5 border border-white/5 w-64">
            <Search size={14} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Type to search..." className="bg-transparent border-none outline-none text-sm text-gray-300 w-full placeholder-gray-500" />
          </div>
        </div>

        {/* Active Apps Dock */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          {windows.map(win => win.isOpen && (
             <button 
               key={win.id}
               onClick={() => toggleWindow(win.id)}
               className={`p-2 rounded-lg transition-all flex items-center gap-2 ${activeId === win.id && !win.isMinimized ? 'bg-white/10 border-b-2 border-indigo-400 rounded-b-sm' : 'hover:bg-white/5 opacity-70 hover:opacity-100'}`}
             >
               {win.icon}
               <span className="text-sm text-gray-200 hidden sm:block">{win.title}</span>
             </button>
          ))}
        </div>

        {/* System Tray */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-gray-400">
             <Wifi size={16} />
             <Battery size={16} />
          </div>
          <div className="flex flex-col items-end text-xs text-gray-300">
            <span className="font-medium">{currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            <span className="text-gray-500">{currentTime.toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}