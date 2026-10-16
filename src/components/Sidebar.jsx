import React from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import packageJson from '../../package.json';
import { Layout, Globe, Database, Code, FileText, Settings, Radio, FileCode, Server, Boxes, Mail, Globe2, LifeBuoy } from 'lucide-react';

/** One nav entry. Defined outside Sidebar: a component created inside it would be remounted on
 * every Sidebar render (stats update every few seconds), dropping keyboard focus and clicks. */
const NavItem = ({ item, active, onSelect }) => {
  const Icon = item.icon;
  return (
    <button type="button" onClick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined} className={`nav-item w-full text-left ${active ? 'active' : ''}`}>
      <Icon size={16} />
      {item.label}
    </button>
  );
};

const Sidebar = () => {
  // `locale` is selected so labels re-render when the language changes (`t` itself is stable).
  const { activePage, setActivePage, systemStats, t } = useStore(useShallow(s => ({
    activePage: s.activePage, setActivePage: s.setActivePage, systemStats: s.systemStats, t: s.t, locale: s.locale,
  })));
  const appVersion = packageJson.version || 'unknown';

  const navItems = [
    { id: 'services', label: t('services'), icon: Layout },
    { id: 'sites', label: t('virtualHosts'), icon: Globe },
    { id: 'domains', label: t('domains'), icon: Globe2 },
    { id: 'apache', label: t('apache'), icon: Server },
    { id: 'database', label: t('database'), icon: Database },
    { id: 'php', label: t('phpRuntime'), icon: Code },
    { id: 'node', label: t('nodeRuntime'), icon: Boxes },
    { id: 'mail', label: t('mailServer'), icon: Mail },
    { id: 'tunnels', label: t('tunnels'), icon: Radio },
    { id: 'logs', label: t('logs'), icon: FileText },
  ];
  // Used now and then: below the separator, with the first-run banner linking to the Guide.
  const bottomItems = [
    { id: 'quickconfig', label: t('quickConfig'), icon: FileCode },
    { id: 'guide', label: t('guide'), icon: LifeBuoy },
    { id: 'settings', label: t('settings'), icon: Settings },
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
        <div className="text-[11px] text-muted font-mono mt-0.5">v{appVersion}</div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
        {navItems.map(item => <NavItem key={item.id} item={item} active={activePage === item.id} onSelect={setActivePage} />)}

        <div className="border-t border-[#1a1c22] my-2.5"></div>

        {bottomItems.map(item => <NavItem key={item.id} item={item} active={activePage === item.id} onSelect={setActivePage} />)}
      </nav>

      {/* System Status Bar */}
      <div className="p-3.5 bg-surface rounded-xl mt-4 flex-shrink-0">
        <div className="text-[11px] text-muted font-bold tracking-widest uppercase mb-2.5">{t('system')}</div>
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
