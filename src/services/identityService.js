const platformAdminsRepo = require('../repository/Platform/platformAdminsRepo');
const merchantUsersRepo = require('../repository/Merchant/usersRepo');
const buyerUsersRepo = require('../repository/Buyer/buyerUsersRepo');
const buyersRepo = require('../repository/Buyer/buyersRepo');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function findEmailConflicts(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return [];
  }
  const [platformAdmin, merchantUser, buyerUser, buyer] = await Promise.all([
    platformAdminsRepo.findByEmail(normalized).catch(() => null),
    merchantUsersRepo.findByEmail(normalized).catch(() => null),
    buyerUsersRepo.findByEmail(normalized).catch(() => null),
    buyersRepo.findByEmail(normalized).catch(() => null)
  ]);

  return [
    platformAdmin ? { type: 'platform-admin', id: platformAdmin.id } : null,
    merchantUser ? { type: 'merchant-user', id: merchantUser.id } : null,
    buyerUser ? { type: 'buyer-user', id: buyerUser.id } : null,
    buyer ? { type: 'buyer-company', id: buyer.id } : null
  ].filter(Boolean);
}

module.exports = {
  normalizeEmail,
  findEmailConflicts
};
