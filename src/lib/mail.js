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
    tag: 'Khuyên dùng',
    desc: 'SMTP inbox local hiện đại, có web UI, API, search, relay và release Windows binary riêng.',
  },
  {
    id: 'mailhog',
    name: 'MailHog',
    tag: 'Dự phòng cũ',
    desc: 'Vẫn quen thuộc nhưng ít phù hợp hơn cho setup mới. Dùng khi cần tương thích với workflow cũ.',
  },
  {
    id: 'mailtrap',
    name: 'Mailtrap',
    tag: 'Cloud sandbox',
    desc: 'Tốt cho team/staging trên cloud, nhưng không phải mail server local free chạy trực tiếp trong DevStack.',
  },
];

export const snippetForMail = (host, smtpPort) => ({
  smtp: `${host}:${smtpPort}`,
  laravel: `MAIL_MAILER=smtp\nMAIL_HOST=${host}\nMAIL_PORT=${smtpPort}\nMAIL_USERNAME=null\nMAIL_PASSWORD=null\nMAIL_ENCRYPTION=null\nMAIL_FROM_ADDRESS=devstack@example.test`,
  node: `SMTP_HOST=${host}\nSMTP_PORT=${smtpPort}\nSMTP_SECURE=false\nSMTP_USER=\nSMTP_PASS=`,
  wordpress: `define('WP_MAIL_SMTP_HOST', '${host}');\ndefine('WP_MAIL_SMTP_PORT', ${smtpPort});`,
});

export const fetchLatestMailpitRelease = async () => {
  const res = await fetch(MAILPIT_REPO_API, { headers: { Accept: 'application/vnd.github+json' } });
  const data = await res.json();
  const asset = data.assets?.find((item) => item.name === 'mailpit-windows-amd64.zip');

  if (!asset?.browser_download_url) return MAILPIT_FALLBACK;

  return {
    version: data.tag_name || MAILPIT_FALLBACK.version,
    url: asset.browser_download_url,
  };
};
