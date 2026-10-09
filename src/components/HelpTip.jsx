import React, { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle, ArrowRight } from 'lucide-react';
import { useStore } from '../store';

/** "?" next to a setting: a short explanation, plus a link to the matching Guide section. */
const HelpTip = ({ textKey, anchor }) => {
  const { openGuide, t } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        className="text-muted hover:text-accent p-0.5"
        aria-label={t('helpLabel')}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute z-50 left-5 top-0 w-[300px] bg-panel border border-border rounded-lg p-3 text-[11px] font-normal normal-case tracking-normal text-textDim leading-relaxed shadow-glow">
          {t(textKey)}
          {anchor && (
            <button type="button" className="mt-2 flex items-center gap-1 text-accent font-semibold" onClick={() => { setOpen(false); openGuide(anchor); }}>
              {t('helpOpenGuide')} <ArrowRight size={11} />
            </button>
          )}
        </span>
      )}
    </span>
  );
};

export default HelpTip;
