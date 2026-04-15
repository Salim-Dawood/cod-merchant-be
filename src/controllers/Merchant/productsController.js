const createController = require('../commonController');
const service = require('../../services/Merchant/productsService');

const baseController = createController(service);

function parsePrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

module.exports = {
  ...baseController,
  async create(req, res, next) {
    try {
      const payload = req.body || {};
      if (payload.base_price === undefined || payload.base_price === null || payload.base_price === '') {
        return res.status(400).json({ errors: { base_price: 'base_price is required' } });
      }
      const price = parsePrice(payload.base_price);
      if (price === null || price <= 0) {
        return res.status(400).json({ errors: { base_price: 'base_price must be a positive number' } });
      }
      req.body = { ...payload, base_price: price };
      return baseController.create(req, res, next);
    } catch (err) {
      return next(err);
    }
  },
  async update(req, res, next) {
    try {
      const payload = req.body || {};
      if (Object.prototype.hasOwnProperty.call(payload, 'base_price')) {
        if (payload.base_price === undefined || payload.base_price === null || payload.base_price === '') {
          return res.status(400).json({ errors: { base_price: 'base_price cannot be empty' } });
        }
        const price = parsePrice(payload.base_price);
        if (price === null || price <= 0) {
          return res.status(400).json({ errors: { base_price: 'base_price must be a positive number' } });
        }
        req.body = { ...payload, base_price: price };
      }
      return baseController.update(req, res, next);
    } catch (err) {
      return next(err);
    }
  }
};
