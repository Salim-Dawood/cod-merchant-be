const crypto = require('crypto');
const passwordResetTokensRepo = require('../repository/passwordResetTokensRepo');
const platformAdminsRepo = require('../repository/Platform/platformAdminsRepo');
const usersRepo = require('../repository/Merchant/usersRepo');
const buyerUsersRepo = require('../repository/Buyer/buyerUsersRepo');
const { hashPassword } = require('../utils/password');
const { sendEmail } = require('../utils/mailer');

const RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);

const actorConfig = {
  platform: {
    repo: platformAdminsRepo,
    label: 'Platform Admin'
  },
  merchant: {
    repo: usersRepo,
    label: 'Merchant User',
    passwordField: 'password'
  },
  buyer: {
    repo: buyerUsersRepo,
    label: 'Buyer User',
    passwordField: 'password_hash'
  }
};

function getFrontendBaseUrl() {
  const explicit = process.env.FRONTEND_BASE_URL || process.env.PUBLIC_FRONTEND_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const corsOrigin = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  return (corsOrigin || 'http://localhost:5173').replace(/\/+$/, '');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildResetLink(actorType, token) {
  const base = getFrontendBaseUrl();
  const params = new URLSearchParams({
    reset: '1',
    actor: actorType,
    token
  });
  return `${base}/login?${params.toString()}`;
}

function genericForgotResponse() {
  return {
    ok: true,
    message: 'If the account exists, a password reset link has been sent.'
  };
}

async function sendResetEmail({ actorType, user, email }) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await passwordResetTokensRepo.invalidateOutstanding(actorType, user.id);
  await passwordResetTokensRepo.create({
    actor_type: actorType,
    actor_id: user.id,
    email,
    token_hash: tokenHash(token),
    expires_at: expiresAt
  });

  const resetLink = buildResetLink(actorType, token);
  const subject = 'Reset Your Password';
  const text = [
    `You requested a password reset for your ${actorConfig[actorType].label} account.`,
    '',
    `Reset link: ${resetLink}`,
    '',
    `This link expires in ${RESET_TTL_MINUTES} minutes.`
  ].join('\n');

  await sendEmail({
    to: email,
    subject,
    text,
    html: `
      <p>You requested a password reset for your ${actorConfig[actorType].label} account.</p>
      <p><a href="${resetLink}">Reset your password</a></p>
      <p>This link expires in ${RESET_TTL_MINUTES} minutes.</p>
    `
  });
}

async function requestReset(actorType, emailInput) {
  const config = actorConfig[actorType];
  if (!config) {
    throw new Error('Unsupported actor type');
  }
  const email = String(emailInput || '').trim().toLowerCase();
  if (!email) {
    return genericForgotResponse();
  }
  const user = await config.repo.findByEmail(email);
  if (!user) {
    return genericForgotResponse();
  }
  await sendResetEmail({ actorType, user, email });
  return genericForgotResponse();
}

async function requestResetById(actorType, actorId) {
  const config = actorConfig[actorType];
  if (!config) {
    throw new Error('Unsupported actor type');
  }
  const user = await config.repo.findById(Number(actorId));
  if (!user?.email) {
    return { ok: false, notFound: true };
  }
  await sendResetEmail({
    actorType,
    user,
    email: String(user.email).trim().toLowerCase()
  });
  return { ok: true, email: user.email };
}

async function resetPassword(actorType, token, nextPassword) {
  const config = actorConfig[actorType];
  if (!config) {
    throw new Error('Unsupported actor type');
  }
  const tokenRow = await passwordResetTokensRepo.findActiveByTokenHash(tokenHash(token));
  if (!tokenRow || tokenRow.actor_type !== actorType) {
    return { ok: false, invalid: true };
  }

  const passwordHash = await hashPassword(nextPassword);
  await config.repo.update(tokenRow.actor_id, { [config.passwordField || 'password']: passwordHash });
  await passwordResetTokensRepo.markUsed(tokenRow.id);
  return { ok: true };
}

module.exports = {
  requestReset,
  requestResetById,
  resetPassword,
  genericForgotResponse
};
