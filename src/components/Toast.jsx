import React from 'react';
import { useStore } from '../store';
import { Check, AlertTriangle, X, Info, ArrowRight } from 'lucide-react';

const icons = {
  ok: { icon: Check, color: 'text-accent', border: 'border-accent/30' },
  warn: { icon: AlertTriangle, color: 'text-warn', border: 'border-warn/30' },
  err: { icon: X, color: 'text-danger', border: 'border-danger/30' },
  danger: { icon: X, color: 'text-danger', border: 'border-danger/30' },
  info: { icon: Info, color: 'text-info', border: 'border-info/30' }
};

const Toast = () => {
  const { toast, setActivePage, openGuide } = useStore();

  if (!toast.show) return null;

  const current = icons[toast.type] || icons.info;
  const Icon = current.icon;
  const { action } = toast;
  const runAction = () => (action.guide !== undefined ? openGuide(action.guide) : setActivePage(action.page));

  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 max-w-[520px] bg-surface border ${current.border} rounded-xl px-4.5 py-3 text-[13px] font-semibold text-text z-[200] shadow-glow flex items-center gap-2.5 transition-all duration-300 animate-in`}
    >
      <Icon size={16} className={`${current.color} shrink-0`} />
      <span className="flex-1">{toast.msg}</span>
      {action && (
        <button type="button" className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1 border border-border shrink-0" onClick={runAction}>
          {action.label} <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
};

export default Toast;
