import React, { useEffect, useState } from 'react';
import { LifeBuoy, RefreshCw, ArrowRight, Copy, Check, Wrench, Loader } from 'lucide-react';
import { useStore } from '../store';
import { RECIPES, TROUBLESHOOTING, checklistDone } from '../lib/guide';

const Card = ({ id, title, desc, actions, children }) => (
  <section id={id} className="bg-surface border border-border rounded-xl p-5 scroll-mt-4">
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-1">
        <h2 className="text-[14px] font-bold m-0">{title}</h2>
        {desc && <p className="text-[12px] text-muted m-0 mt-1 leading-relaxed">{desc}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const VITE_SNIPPET = `// vite.config.js
export default defineConfig({
  server: {
    allowedHosts: ['local-admin.example.test'], // Vite >= 5.4.12 / 6.0.9
    hmr: { clientPort: 443 },                  // only for HTTPS sites
  },
});`;

const CopyBlock = ({ text }) => {
  const { t } = useStore();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative mt-2">
      <pre className="bg-[#0a0b0d] border border-border rounded-lg p-3 text-[11px] font-mono text-textDim overflow-x-auto m-0">{text}</pre>
      <button type="button" className="btn-ghost absolute top-2 right-2 p-1.5" onClick={copy} aria-label={t('copy')} title={t('copy')}>
        {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
      </button>
    </div>
  );
};

const statusDot = { ok: 'dot-running', warn: 'dot-warn', fail: 'bg-danger' };

const Checklist = () => {
  const { guideChecks, guideChecking, runGuideChecks, runGuideFix, t } = useStore();
  const [fixing, setFixing] = useState('');
  const done = checklistDone(guideChecks);

  const fix = async (row) => {
    setFixing(row.id);
    try { await runGuideFix(row.fix); } finally { setFixing(''); }
  };

  return (
    <Card
      id="checklist"
      title={t('guideChecklistTitle')}
      desc={done ? t('guideChecklistDone') : t('guideChecklistDesc')}
      actions={(
        <button type="button" className="btn-ghost flex items-center gap-1.5 border border-border text-[12px] py-1.5 px-3" onClick={runGuideChecks} disabled={guideChecking}>
          <RefreshCw size={13} className={guideChecking ? 'animate-spin' : ''} /> {t('guideRecheck')}
        </button>
      )}
    >
      <div className="flex flex-col divide-y divide-border">
        {guideChecks.map(row => (
          <div key={row.id} className="flex items-start gap-3 py-2.5">
            <span className={`status-dot mt-1.5 shrink-0 ${statusDot[row.status]}`} aria-label={row.status} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold">{t(`guideCheck_${row.id}`)}</div>
              {row.status !== 'ok' && (
                <div className="text-[11px] text-muted mt-0.5 leading-relaxed">
                  {row.detailKey ? t(row.detailKey) : t(`guideCheck_${row.id}_hint`, row.params)}
                </div>
              )}
            </div>
            {row.status !== 'ok' && row.fix && (
              <button type="button" className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1 shrink-0" onClick={() => fix(row)} disabled={!!fixing}>
                {fixing === row.id ? <Loader size={12} className="animate-spin" /> : <Wrench size={12} />} {t(row.fix.page ? 'guideOpenPage' : 'guideFix')}
              </button>
            )}
          </div>
        ))}
        {!guideChecks.length && <span className="text-[12px] text-muted italic py-2">{t('guideChecking')}</span>}
      </div>
    </Card>
  );
};

const Recipe = ({ recipe }) => {
  const { setActivePage, t } = useStore();
  return (
    <Card id={`recipe-${recipe.id}`} title={t(`guideRecipe_${recipe.id}`)} desc={t(`guideRecipe_${recipe.id}_intro`)}>
      <ol className="m-0 pl-0 list-none flex flex-col gap-2.5">
        {recipe.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <span className="flex-1 text-[12px] leading-relaxed text-textDim">{t(`guideRecipe_${recipe.id}_${i + 1}`)}</span>
            {step.page && (
              <button type="button" className="btn-ghost text-[11px] py-0.5 px-2 flex items-center gap-1 shrink-0" onClick={() => setActivePage(step.page)}>
                {t(`page_${step.page}`)} <ArrowRight size={11} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {recipe.id === 'vite' && <CopyBlock text={VITE_SNIPPET} />}
    </Card>
  );
};

const Troubleshooting = () => {
  const { setActivePage, t } = useStore();
  const go = (row) => {
    if (row.page) setActivePage(row.page);
    else document.getElementById(row.anchor)?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <Card id="troubleshooting" title={t('guideTroubleTitle')} desc={t('guideTroubleDesc')}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-x-3 text-[10px] font-bold text-muted uppercase tracking-wider pb-2">
        <span>{t('guideSymptom')}</span><span>{t('guideCause')}</span><span>{t('guideFixCol')}</span><span />
      </div>
      <div className="flex flex-col divide-y divide-border">
        {TROUBLESHOOTING.map(row => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-x-3 py-2.5 text-[12px] leading-relaxed items-start">
            <span className="font-semibold">{t(`guideTs_${row.id}`)}</span>
            <span className="text-muted">{t(`guideTs_${row.id}_cause`)}</span>
            <span className="text-textDim">{t(`guideTs_${row.id}_fix`)}</span>
            <button type="button" className="btn-ghost text-[11px] py-0.5 px-2 flex items-center gap-1" onClick={() => go(row)} aria-label={t('guideOpenPage')}>
              <ArrowRight size={11} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};

const PageGuide = () => {
  const { runGuideChecks, guideAnchor, t } = useStore();

  useEffect(() => { runGuideChecks(); }, []);
  useEffect(() => {
    if (guideAnchor) document.getElementById(guideAnchor)?.scrollIntoView({ behavior: 'smooth' });
  }, [guideAnchor]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg">
        <h1 className="text-[18px] font-extrabold m-0 flex items-center gap-2"><LifeBuoy size={20} className="text-accent" /> {t('guideTitle')}</h1>
        <p className="text-[12px] text-muted m-0 mt-1">{t('guideDesc')}</p>
        <nav className="flex flex-wrap gap-2 mt-3">
          {['checklist', ...RECIPES.map(r => `recipe-${r.id}`), 'troubleshooting'].map(anchor => (
            <button
              key={anchor}
              type="button"
              className="btn-ghost border border-border text-[11px] py-1 px-2.5"
              onClick={() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {anchor === 'checklist' ? t('guideChecklistTitle') : anchor === 'troubleshooting' ? t('guideTroubleTitle') : t(`guideRecipe_${anchor.slice(7)}`)}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <Checklist />
        {RECIPES.map(recipe => <Recipe key={recipe.id} recipe={recipe} />)}
        <Troubleshooting />
      </div>
    </div>
  );
};

export default PageGuide;
