import React, { useEffect, useRef, useState } from 'react';

const SHOW_DELAY = 350;
const GAP = 8;

/**
 * One styled tooltip for the whole app. Any element with a `title` attribute gets it:
 * on hover/focus the title moves to `data-tip` (so the plain OS tooltip never shows)
 * and is drawn here, above the element, or below when there is no room.
 */
const Tooltip = () => {
  const [tip, setTip] = useState(null);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const timer = useRef(0);
  const target = useRef(null);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      target.current = null;
      setTip(null);
      setPos(null);
    };

    const show = (e) => {
      const el = e.target instanceof Element ? e.target.closest('[title], [data-tip]') : null;
      if (!el || el === target.current) return;
      // React may set a new title on re-render: it wins over the stored one.
      const text = el.getAttribute('title') || el.getAttribute('data-tip');
      if (el.hasAttribute('title')) {
        el.setAttribute('data-tip', text);
        el.removeAttribute('title');
        // An icon-only button named only by its title keeps that name for screen readers.
        if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text);
      }
      if (!text) return;
      clearTimeout(timer.current);
      target.current = el;
      timer.current = setTimeout(() => setTip({ text, rect: el.getBoundingClientRect() }), e.type === 'focusin' ? 0 : SHOW_DELAY);
    };

    const leave = (e) => {
      if (target.current && !target.current.contains(e.relatedTarget)) hide();
    };

    document.addEventListener('mouseover', show);
    document.addEventListener('mouseout', leave);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('mouseover', show);
      document.removeEventListener('mouseout', leave);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Measure after render, then place: above by default, flipped below near the top edge.
  useEffect(() => {
    if (!tip || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const { rect } = tip;
    const below = rect.top - box.height - GAP < 4;
    const top = below ? rect.bottom + GAP : rect.top - box.height - GAP;
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - box.width / 2, 6), window.innerWidth - box.width - 6);
    setPos({ top, left, below, arrow: center - left });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-[100] pointer-events-none max-w-[320px] px-2.5 py-1.5 rounded-lg bg-panel border border-accent/30 text-[12px] leading-snug text-text whitespace-pre-line shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-150"
      style={pos
        ? { top: pos.top, left: pos.left, opacity: 1, transform: 'translateY(0)' }
        : { top: -9999, left: -9999, opacity: 0, transform: 'translateY(4px)' }}
    >
      {tip.text}
      {pos && (
        <span
          className={`absolute w-2 h-2 bg-panel border-accent/30 rotate-45 ${pos.below ? '-top-[5px] border-l border-t' : '-bottom-[5px] border-r border-b'}`}
          style={{ left: pos.arrow - 4 }}
        />
      )}
    </div>
  );
};

export default Tooltip;
