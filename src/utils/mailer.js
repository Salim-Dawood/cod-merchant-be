let nodemailer = null;
try {
  // Optional dependency. If unavailable, the app logs reset links for manual testing.
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function parseFrom(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { email: 'no-reply@localhost', name: undefined, raw: 'no-reply@localhost' };
  }
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (!match) {
    return { email: raw, name: undefined, raw };
  }
  const name = match[1].trim().replace(/^"|"$/g, '') || undefined;
  const email = match[2].trim();
  return { email, name, raw };
}

function getTransport() {
  if (!nodemailer) {
    return null;
  }
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // Fail faster on unreachable SMTP endpoints so the UI does not hang for ~2 minutes.
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000)
  });
}

async function sendViaBrevoApi({ from, to, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available for Brevo API transport');
  }

  const parsedFrom = parseFrom(from);
  const recipient = parseFrom(to);
  const payload = {
    sender: {
      email: parsedFrom.email
    },
    to: [{ email: recipient.email }],
    subject,
    htmlContent: html || `<pre>${String(text || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
    textContent: text || undefined
  };
  if (parsedFrom.name) {
    payload.sender.name = parsedFrom.name;
  }
  if (recipient.name) {
    payload.to[0].name = recipient.name;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Brevo API send failed (${res.status})${body ? `: ${body}` : ''}`);
    err.code = 'BREVO_API_SEND_FAILED';
    throw err;
  }

  return { delivered: true, fallback: false, provider: 'brevo-api' };
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  const brevoResult = await sendViaBrevoApi({ from, to, subject, text, html });
  if (brevoResult) {
    return brevoResult;
  }
  const transport = getTransport();
  if (!transport) {
    console.log('[MAILER:FALLBACK]', { to, subject, text, html });
    return { delivered: false, fallback: true };
  }
  await transport.sendMail({ from, to, subject, text, html });
  return { delivered: true, fallback: false };
}

module.exports = {
  sendEmail
};
