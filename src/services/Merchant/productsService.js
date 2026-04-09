const createService = require('../commonService');
const repo = require('../../repository/Merchant/productsRepo');
const pool = require('../../db');

async function resolveMerchantId(branchId) {
  if (!branchId) {
    return null;
  }
  const [rows] = await pool.query(
    'SELECT merchant_id FROM branches WHERE id = ? LIMIT 1',
    [branchId]
  );
  return rows[0]?.merchant_id || null;
}

const base = createService(repo);

module.exports = {
  ...base,
  create: async (data) => {
    const payload = { ...data };
    if (!payload.merchant_id && payload.branch_id) {
      payload.merchant_id = await resolveMerchantId(payload.branch_id);
    }
    if (payload.base_price === '' || payload.base_price === null || payload.base_price === undefined) {
      delete payload.base_price;
    }
    return repo.create(payload);
  },
  update: async (id, data) => {
    const payload = { ...data };
    if (!payload.merchant_id && payload.branch_id) {
      payload.merchant_id = await resolveMerchantId(payload.branch_id);
    }
    if (payload.base_price === '') {
      payload.base_price = null;
    }
    return repo.update(id, payload);
  }
};
