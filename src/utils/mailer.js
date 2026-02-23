let nodemailer = null;
try {
  // Optional dependency. If unavailable, the app logs reset links for manual testing.
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
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
    auth: { user, pass }
  });
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';
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
