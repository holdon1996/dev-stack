import React from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Download, ExternalLink, Inbox, Loader, Mail, Play, Square } from 'lucide-react';
import { useStore } from '../store';
import { MAILPIT_DOCS, MAILPIT_FALLBACK, fetchLatestMailpitRelease, mailProviders, snippetForMail } from '../lib/mail';

const ProviderCard = ({ provider, active, onClick, t }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`rounded-lg border p-4 text-left transition-colors ${active ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-white/15'}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="text-[15px] font-bold text-white">{provider.name}</div>
      <span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${active ? 'bg-accent text-bg' : 'border border-white/10 text-textDim'}`}>
        {t(provider.tagKey)}
      </span>
    </div>
    <p className="mt-3 text-[12px] leading-6 text-textDim">{t(provider.descKey)}</p>
  </button>
);

const Snippet = ({ label, value, copied, onCopy, t }) => (
  <div className="rounded-lg border border-white/8 bg-bg p-4">
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="text-[12px] font-semibold text-white">{label}</div>
      <button type="button" className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-[11px]" onClick={onCopy}>
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? t('copied') : t('copy')}
      </button>
    </div>
    <pre className="overflow-x-auto whitespace-pre-wrap text-[12px] leading-6 text-slate-200">{value}</pre>
  </div>
);

const PageMailServer = () => {
  const { settings, updateSetting, updateSettings, showToast, toggleService, t } = useStore();
  // Running state comes from the shared service poll (no own port polling), and Start/Stop
  // go through toggleService like the Services row: port-owner check, crash detection, logs.
  const mailSvc = useStore(s => s.services.find(x => x.type === 'mail'));
  const running = mailSvc?.status === 'running';
  const transitioning = mailSvc?.status === 'starting' || mailSvc?.status === 'stopping';
  const [release, setRelease] = React.useState(MAILPIT_FALLBACK);
  const [installed, setInstalled] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [progress, setProgress] = React.useState({ pct: 0, downloaded: 0, total: 0 });
  const [copiedKey, setCopiedKey] = React.useState('');

  const baseDir = (settings.devStackDir || 'C:/devstack').replace(/[\\\/]+$/, '');
  const mailDir = `${baseDir}/bin/mail/mailpit`;
  const mailpitExe = `${mailDir}/mailpit.exe`.replace(/\//g, '\\');
  const providerId = settings.mailProvider || 'mailpit';
  const host = settings.mailHost || '127.0.0.1';
  const smtpPort = parseInt(settings.mailSmtpPort || 1025, 10);
  const uiPort = parseInt(settings.mailUiPort || 8025, 10);
  const inboxUrl = `http://${host}:${uiPort}`;
  const snippets = snippetForMail(host, smtpPort);

  const refreshStatus = React.useCallback(async () => {
    try {
      setInstalled(!!(await invoke('path_exists', { path: mailpitExe })));
    } catch (e) {
      console.error('refresh mail status failed:', e);
    }
  }, [mailpitExe]);

  React.useEffect(() => { refreshStatus(); }, [refreshStatus]);

  React.useEffect(() => {
    let cancelled = false;
    const loadLatest = async () => {
      try {
        const latest = await fetchLatestMailpitRelease();
        if (!cancelled) setRelease(latest);
      } catch (e) {
        console.warn('fetch latest Mailpit failed, using fallback:', e);
      }
    };
    loadLatest();
    return () => { cancelled = true; };
  }, []);

  const installMailpit = async () => {
    setInstalling(true);
    setProgress({ pct: 0, downloaded: 0, total: 0 });

    let unlisten = null;
    try {
      unlisten = await listen('download-progress', (event) => {
        if (event.payload?.svcType === 'mail') {
          setProgress({
            pct: event.payload.pct || 0,
            downloaded: event.payload.downloaded || 0,
            total: event.payload.total || 0,
          });
        }
      });

      await invoke('install_binary', {
        svcType: 'mail',
        version: release.version,
        url: release.url,
        destDir: mailDir.replace(/\//g, '\\'),
        expectedSizeMb: null,
      });

      // Keep the user's host and ports: only fill in defaults that were never set.
      updateSettings({
        mailProvider: 'mailpit',
        mailHost: settings.mailHost || '127.0.0.1',
        mailSmtpPort: settings.mailSmtpPort || 1025,
        mailUiPort: settings.mailUiPort || 8025,
        mailpitVersion: release.version,
      });
      showToast(t('versionInstalled', { name: `Mailpit ${release.version}` }), 'ok');
      await refreshStatus();
    } catch (e) {
      console.error('installMailpit failed:', e);
      showToast(t('mailpitInstallFailed', { error: `${e}` }), 'danger');
    } finally {
      if (unlisten) unlisten();
      setInstalling(false);
    }
  };

  const startMailpit = () => {
    if (!installed) {
      showToast(t('mailpitNotInstalled'), 'warn');
      return;
    }
    if (mailSvc) toggleService(mailSvc.id, 'start');
  };

  const stopMailpit = () => {
    if (mailSvc) toggleService(mailSvc.id, 'stop');
  };

  const openExternal = async (target) => {
    try {
      await invoke('open_external_target', { target });
    } catch (e) {
      showToast(t('openLinkFailed', { error: `${e}` }), 'danger');
    }
  };

  const copyText = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      showToast(t('mailConfigCopied'), 'ok');
      window.setTimeout(() => setCopiedKey(''), 1600);
    } catch (e) {
      showToast(t('copyFailedError', { error: `${e}` }), 'danger');
    }
  };

  const selectProvider = (id) => {
    updateSetting('mailProvider', id);
    if (id === 'mailpit') {
      updateSettings({ mailHost: settings.mailHost || '127.0.0.1', mailSmtpPort: settings.mailSmtpPort || 1025, mailUiPort: settings.mailUiPort || 8025 });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg">
        <h1 className="m-0 flex items-center gap-2 text-[20px] font-extrabold">
          <Mail size={18} className="text-accent" /> {t('mailServer')}
        </h1>
        <p className="m-0 mt-1 text-[12px] font-mono text-muted">
          {t('mailServerDesc')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <div className="rounded-lg border border-accent/20 bg-[#15201c] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[15px] font-bold text-white">{t('mailRecommendTitle')}</div>
              <p className="mt-2 max-w-4xl text-[13px] leading-7 text-slate-200">
                {t('mailRecommendDesc', { version: release.version })}
              </p>
            </div>
            <div className={`rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ${running ? 'border-accent/30 bg-accent/10 text-accent' : 'border-white/10 text-textDim'}`}>
              {running ? t('running') : installed ? t('installed') : t('notInstalledLabel')}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {mailProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              active={providerId === provider.id}
              onClick={() => selectProvider(provider.id)}
              t={t}
            />
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t('mailRuntimeTitle')}</div>
                <div className="mt-1 text-[12px] text-textDim">{mailpitExe}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost flex items-center gap-2" onClick={installMailpit} disabled={installing}>
                  {installing ? <Loader size={14} className="animate-spin" /> : <Download size={14} />} {installed ? t('updateAction') : t('install')}
                </button>
                <button type="button" className="btn-ghost flex items-center gap-2" onClick={running ? stopMailpit : startMailpit} disabled={installing || transitioning}>
                  {running ? <Square size={13} /> : <Play size={13} />} {running ? t('stop') : t('start')}
                </button>
                <button type="button" className="btn-ghost flex items-center gap-2" onClick={() => openExternal(inboxUrl)}>
                  <Inbox size={13} /> {t('inboxLabel')}
                </button>
              </div>
            </div>

            {installing && (
              <div className="mt-4 rounded-lg border border-white/8 bg-bg p-4">
                <div className="mb-2 flex justify-between text-[11px] font-mono text-textDim">
                  <span>{t('downloadingVersion', { version: release.version })}</span>
                  <span>{progress.pct}%</span>
                </div>
                <div className="bar-bg">
                  <div className="bar-fill bg-gradient-to-r from-accent to-accentDim" style={{ width: `${progress.pct}%` }} />
                </div>
                <div className="mt-2 text-[11px] text-muted">
                  {progress.total ? `${progress.downloaded} MB / ${progress.total} MB` : `${progress.downloaded} MB`}
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-textDim">{t('smtpHostLabel')}</span>
                <input className="input-field" value={host} onChange={(e) => updateSetting('mailHost', e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-textDim">{t('smtpPortLabel')}</span>
                <input className="input-field" value={smtpPort} onChange={(e) => updateSetting('mailSmtpPort', e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-textDim">{t('webInboxPortLabel')}</span>
                <input className="input-field" value={uiPort} onChange={(e) => updateSetting('mailUiPort', e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-textDim">{t('inboxUrlLabel')}</span>
                <button type="button" className="input-field text-left hover:border-accent/40" onClick={() => openExternal(inboxUrl)}>
                  {inboxUrl}
                </button>
              </label>
            </div>

            <div className="mt-5 rounded-lg border border-white/8 bg-bg p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t('equivalentCommand')}</div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[12px] leading-6 text-slate-200">
                {`mailpit.exe --smtp=${host}:${smtpPort} --listen=${host}:${uiPort}`}
              </pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="btn-ghost flex items-center gap-2" onClick={() => openExternal(MAILPIT_DOCS)}>
                  <ExternalLink size={13} /> {t('docsLabel')}
                </button>
                <button type="button" className="btn-ghost flex items-center gap-2" onClick={() => copyText('command', `mailpit.exe --smtp=${host}:${smtpPort} --listen=${host}:${uiPort}`)}>
                  {copiedKey === 'command' ? <Check size={13} /> : <Copy size={13} />} {t('copyCommand')}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t('appConnectionSnippets')}</div>
            <div className="mt-4 space-y-4">
              <Snippet t={t} label="SMTP endpoint" value={snippets.smtp} copied={copiedKey === 'smtp'} onCopy={() => copyText('smtp', snippets.smtp)} />
              <Snippet t={t} label="Laravel / .env" value={snippets.laravel} copied={copiedKey === 'laravel'} onCopy={() => copyText('laravel', snippets.laravel)} />
              <Snippet t={t} label="Node / Nodemailer" value={snippets.node} copied={copiedKey === 'node'} onCopy={() => copyText('node', snippets.node)} />
              <Snippet t={t} label="WordPress SMTP" value={snippets.wordpress} copied={copiedKey === 'wordpress'} onCopy={() => copyText('wordpress', snippets.wordpress)} />
            </div>

            <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-[12px] leading-6 text-amber-50">
              {t('mailLocalOnlyNote', { host, port: smtpPort })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageMailServer;
