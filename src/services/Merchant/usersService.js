const repo = require('../../repository/Merchant/usersRepo');
const photosRepo = require('../../repository/Merchant/userPhotosRepo');
const pool = require('../../db');
const { hashPassword, isHashed } = require('../../utils/password');

async function resolveDefaultBranchId(merchantId) {
  if (!merchantId) {
    return null;
  }
  const [rows] = await pool.query(
    `SELECT id
     FROM branches
     WHERE merchant_id = ?
     ORDER BY is_main DESC, id ASC
     LIMIT 1`,
    [merchantId]
  );
  return rows[0]?.id || null;
}

module.exports = {
  list: () => repo.findAll(),
  listForMerchant: (merchant) => repo.findAllForMerchant(merchant),
  getById: (id) => repo.findById(id),
  create: async (data) => {
    const payload = { ...data };
    if (payload.branch_id === '' || payload.branch_id === undefined) {
      delete payload.branch_id;
    }
    if (!payload.branch_id && payload.merchant_id) {
      payload.branch_id = await resolveDefaultBranchId(payload.merchant_id);
    }
    if (payload.password && !isHashed(payload.password)) {
      payload.password = await hashPassword(payload.password);
    }
    const avatarUrl = payload.avatar_url;
    delete payload.avatar_url;
    const result = await repo.create(payload);
    if (result.insertId) {
      await photosRepo.setActivePhoto(result.insertId, avatarUrl);
    }
    return result;
  },
  update: async (id, data) => {
    const payload = { ...data };
    if (payload.password && !isHashed(payload.password)) {
      payload.password = await hashPassword(payload.password);
    }
    const avatarUrl = payload.avatar_url;
    delete payload.avatar_url;
    let result = { affectedRows: 0 };
    const hasUpdates = Object.keys(payload).length > 0;
    if (hasUpdates) {
      result = await repo.update(id, payload);
    }
    if (avatarUrl) {
      const shouldCheck = !hasUpdates || !result.affectedRows;
      if (shouldCheck) {
        const existing = await repo.findById(id);
        if (!existing) {
          return { affectedRows: 0 };
        }
      }
      await photosRepo.setActivePhoto(id, avatarUrl);
      return { affectedRows: 1 };
    }
    return result;
  },
  remove: (id) => repo.remove(id)
};
