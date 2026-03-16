import React from 'react';
import { useStore } from '../store';
import { Check, AlertTriangle, X, Info } from 'lucide-react';

const Toast = () => {
  const { toast } = useStore();

  if (!toast.show) return null;

  const icons = {
    ok: { icon: Check, color: 'text-accent', border: 'border-accent/30' },
    warn: { icon: AlertTriangle, color: 'text-warn', border: 'border-warn/30' },
    err: { icon: X, color: 'text-danger', border: 'border-danger/30' },
    info: { icon: Info, color: 'text-info', border: 'border-info/30' }
  };

  const current = icons[toast.type] || icons.info;
  const Icon = current.icon;

  return (
    <div 
      className={`fixed bottom-6 right-6 bg-surface border ${current.border} rounded-xl px-4.5 py-3 text-[13px] font-semibold text-text z-[200] shadow-glow flex items-center gap-2.5 transition-all duration-300 animate-in`}
    >
      <Icon size={16} className={current.color} />
      <span>{toast.msg}</span>
    </div>
  );
};

export default Toast;
