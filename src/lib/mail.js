export const MAILPIT_REPO_API = 'https://api.github.com/repos/axllent/mailpit/releases/latest';
export const MAILPIT_DOCS = 'https://mailpit.axllent.org/docs/';
export const MAILPIT_FALLBACK = {
  version: 'v1.29.7',
  url: 'https://github.com/axllent/mailpit/releases/download/v1.29.7/mailpit-windows-amd64.zip',
};

export const mailProviders = [
  {
    id: 'mailpit',
    name: 'Mailpit',
    tagKey: 'mailProviderTagMailpit',
    descKey: 'mailProviderDescMailpit',
  },
  {
    id: 'mailhog',
    name: 'MailHog',
    tagKey: 'mailProviderTagMailhog',
    descKey: 'mailProviderDescMailhog',
  },
  {
    id: 'mailtrap',
    name: 'Mailtrap',
    tagKey: 'mailProviderTagMailtrap',
    descKey: 'mailProviderDescMailtrap',
  },
];

export const snippetForMail = (host, smtpPort) => ({
  smtp: `${host}:${smtpPort}`,
  laravel: `MAIL_MAILER=smtp\nMAIL_HOST=${host}\nMAIL_PORT=${smtpPort}\nMAIL_USERNAME=null\nMAIL_PASSWORD=null\nMAIL_ENCRYPTION=null\nMAIL_FROM_ADDRESS=devstack@example.test`,
  node: `SMTP_HOST=${host}\nSMTP_PORT=${smtpPort}\nSMTP_SECURE=false\nSMTP_USER=\nSMTP_PASS=`,
  wordpress: `define('WP_MAIL_SMTP_HOST', '${host}');\ndefine('WP_MAIL_SMTP_PORT', ${smtpPort});`,
});

let latestRelease = null;

/** Latest Mailpit release, fetched once per app session (GitHub allows 60 anonymous calls an hour). */
export const fetchLatestMailpitRelease = async () => {
  latestRelease ||= fetchMailpitRelease().catch((e) => { latestRelease = null; throw e; });
  return latestRelease;
};

const fetchMailpitRelease = async () => {
  const res = await fetch(MAILPIT_REPO_API, { headers: { Accept: 'application/vnd.github+json' } });
  // e.g. 403 when GitHub's anonymous rate limit is hit: fail, so the fallback is not cached.
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  const asset = data.assets?.find((item) => item.name === 'mailpit-windows-amd64.zip');

  if (!asset?.browser_download_url) return MAILPIT_FALLBACK;

  return {
    version: data.tag_name || MAILPIT_FALLBACK.version,
    url: asset.browser_download_url,
  };
};
