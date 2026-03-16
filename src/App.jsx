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

function App() {
  const { activePage, initApp } = useStore();

  useEffect(() => {
    initApp();
  }, []);
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg font-display text-text">
      {/* Title Bar - In Tauri we usually use custom titlebar or native, for now we keep the UI one */}
      <div className="titlebar px-4 gap-3">
        <div className="titlebar-btn flex gap-2 mr-2">
          <div className="w-3 h-3 bg-[#ff5f57] rounded-full cursor-pointer" title="Quit"></div>
          <div className="w-3 h-3 bg-[#febc2e] rounded-full cursor-pointer" title="Minimize"></div>
          <div className="w-3 h-3 bg-[#28c840] rounded-full cursor-pointer" title="Maximize"></div>
        </div>
        <div className="flex-1 text-center text-[12px] color-[#6b7280] font-bold tracking-[0.08em] uppercase">
          DevStack — Local Dev Environment
        </div>
        <div className="w-16"></div>
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
