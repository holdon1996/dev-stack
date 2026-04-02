import React from 'react';
import { useStore } from '../store';
import packageJson from '../../package.json';
import { Layout, Globe, Database, Code, FileText, Settings, Radio, FileCode, Server, Boxes } from 'lucide-react';

const Sidebar = () => {
  const { activePage, setActivePage, systemStats, t } = useStore();
  const appVersion = packageJson.version || 'unknown';

  const navItems = [
    { id: 'services', label: t('services'), icon: Layout },
    { id: 'sites', label: t('virtualHosts'), icon: Globe },
    { id: 'apache', label: t('apache'), icon: Server },
    { id: 'database', label: t('database'), icon: Database },
    { id: 'php', label: t('phpRuntime'), icon: Code },
    { id: 'node', label: t('nodeRuntime'), icon: Boxes },
    { id: 'tunnels', label: t('tunnels'), icon: Radio },
    { id: 'logs', label: t('logs'), icon: FileText },
  ];

  // Redundant polling removed. Handled by global hooks in App.jsx.

  const cpuPct = systemStats.cpu;
  const ramPct = systemStats.ramTotal ? Math.round((systemStats.ram / systemStats.ramTotal) * 100) : 0;

  return (
    <div className="w-[200px] min-h-0 overflow-hidden bg-bg border-r border-[#1a1c22] flex flex-col p-4 pt-4 gap-0.5 flex-shrink-0">
      <div className="px-3 pb-5">
        <div className="text-xl font-extrabold tracking-tighter text-text">
          dev<span className="text-accent">stack</span>
        </div>
        <div className="text-[10px] text-muted font-mono mt-0.5">v{appVersion}</div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            >
              <Icon size={16} />
              {item.label}
            </div>
          );
        })}

        <div className="border-t border-[#1a1c22] my-2.5"></div>

        <div
          onClick={() => setActivePage('quickconfig')}
          className={`nav-item ${activePage === 'quickconfig' ? 'active' : ''}`}
        >
          <FileCode size={16} />
          {t('quickConfig')}
        </div>

        <div
          onClick={() => setActivePage('settings')}
          className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
        >
          <Settings size={16} />
          {t('settings')}
        </div>

        <div className="mt-6 px-3 py-4 border-t border-white/10 bg-white/[0.03] rounded-xl mx-1 shadow-2xl">
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-accent uppercase tracking-[0.15em]">
              © 2026 DevStack
            </div>
            <div className="text-[12px] text-white font-semibold flex items-center gap-2 mt-1">
              <span className="text-[10px] text-accent/80 font-bold uppercase tracking-tighter bg-accent/10 px-1.5 py-0.5 rounded">{t('creator')}</span>
              <span>ThachVD</span>
            </div>
            <div className="text-[11px] text-textDim hover:text-white transition-colors cursor-default select-all" title="vuducthach25@gmail.com">
              vuducthach25@gmail.com
            </div>
          </div>
        </div>
      </nav>

      {/* System Status Bar */}
      <div className="p-3.5 bg-surface rounded-xl mt-4 flex-shrink-0">
        <div className="text-[10px] text-muted font-bold tracking-widest uppercase mb-2.5">{t('system')}</div>
        <div className="mb-2">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-textDim">{t('cpuShort')}</span>
            <span className="text-text font-mono">{cpuPct}%</span>
          </div>
          <div className="bar-bg">
            <div className="bar-fill bg-gradient-to-r from-accent to-accentDim" style={{ width: `${cpuPct}%` }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-textDim">{t('ramShort')}</span>
            <span className="text-text font-mono">
              {systemStats.ram}GB<span className="opacity-30 mx-0.5">/</span>{systemStats.ramTotal}GB
            </span>
          </div>
          <div className="bar-bg">
            <div className="bar-fill bg-gradient-to-r from-info to-[#2d7dd6]" style={{ width: `${ramPct}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
