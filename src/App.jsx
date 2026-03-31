import React, { useEffect } from 'react';
import { useStore } from './store';
import Sidebar from './components/Sidebar';
import PageServices from './components/PageServices';
import PageSites from './components/PageSites';
import PageDatabase from './components/PageDatabase';
import PagePHP from './components/PagePHP';
import PageLogs from './components/PageLogs';
import PageSettings from './components/PageSettings';
import PageTunnels from './components/PageTunnels';
import PageQuickConfig from './components/PageQuickConfig';
import PageApache from './components/PageApache';
import Toast from './components/Toast';
import Modal from './components/Modal';
import { X, Minus, Maximize2 } from 'lucide-react';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { useServicePoll } from './hooks/useServicePoll';
import { useSystemStats } from './hooks/useSystemStats';

const appWindow = getCurrentWindow();

function App() {
  const { activePage, initApp, killAllChildProcesses, addServiceLog, checkAppUpdate } = useStore();

  useServicePoll();
  useSystemStats();

  useEffect(() => {
    initApp();
    checkAppUpdate(true);
  }, []);

  // Global error handler — pipes all JS errors to Nhật ký tab (visible in built app without DevTools)
  useEffect(() => {
    const handleError = (msg, src, line, col, err) => {
      const detail = err?.stack || `${msg} (${src}:${line}:${col})`;
      addServiceLog('apache', `[JS Error] ${detail}`, 'err');
    };
    const handleRejection = (e) => {
      const detail = e.reason?.stack || e.reason?.message || String(e.reason);
      addServiceLog('apache', `[Unhandled Promise] ${detail}`, 'err');
    };
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args) => {
      origError(...args);
      addServiceLog('apache', `[console.error] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`, 'err');
    };
    console.warn = (...args) => {
      origWarn(...args);
      addServiceLog('apache', `[console.warn] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`, 'warn');
    };
    window.onerror = handleError;
    window.onunhandledrejection = handleRejection;
    return () => {
      window.onerror = null;
      window.onunhandledrejection = null;
      console.error = origError;
      console.warn = origWarn;
    };
  }, [addServiceLog]);

  const handleClose = async () => {
    await killAllChildProcesses();
    await appWindow.close();
  };
  const handleMinimize = async () => { await appWindow.minimize(); };
  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg font-display text-text">
      {/* Title Bar */}
      <div className="titlebar px-4 gap-3" data-tauri-drag-region>
        <div className="titlebar-btn flex gap-2 mr-2 group/btns">
          <div
            className="w-3.5 h-3.5 bg-[#ff5f57] rounded-full cursor-pointer hover:brightness-90 active:brightness-75 transition-all flex items-center justify-center border border-black/10"
            title="Đóng" onClick={handleClose}
          >
            <X size={8} className="text-black/60 opacity-0 group-hover/btns:opacity-100 transition-opacity" />
          </div>
          <div
            className="w-3.5 h-3.5 bg-[#febc2e] rounded-full cursor-pointer hover:brightness-90 active:brightness-75 transition-all flex items-center justify-center border border-black/10"
            title="Thu nhỏ" onClick={handleMinimize}
          >
            <Minus size={10} className="text-black/60 opacity-0 group-hover/btns:opacity-100 transition-opacity" />
          </div>
          <div
            className="w-3.5 h-3.5 bg-[#28c840] rounded-full cursor-pointer hover:brightness-90 active:brightness-75 transition-all flex items-center justify-center border border-black/10"
            title="Phóng to / Thu nhỏ" onClick={handleMaximize}
          >
            <Maximize2 size={8} className="text-black/60 opacity-0 group-hover/btns:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex-1 text-center text-[12px] color-[#6b7280] font-bold tracking-[0.08em] uppercase" data-tauri-drag-region>
          DevStack — Local Dev Environment
        </div>
        <div className="w-16" />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col bg-[#13151a] overflow-hidden">
          {activePage === 'services' && <PageServices />}
          {activePage === 'sites' && <PageSites />}
          {activePage === 'database' && <PageDatabase />}
          {activePage === 'php' && <PagePHP />}
          {activePage === 'apache' && <PageApache />}
          {activePage === 'logs' && <PageLogs />}
          {activePage === 'tunnels' && <PageTunnels />}
          {activePage === 'quickconfig' && <PageQuickConfig />}
          {activePage === 'settings' && <PageSettings />}
        </main>
      </div>

      <Toast />
      <Modal />
    </div>
  );
}

export default App;
