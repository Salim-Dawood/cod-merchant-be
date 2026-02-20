const productsRepo = require('../../repository/Client/clientProductsRepo');

async function list(req, res, next) {
  try {
    const rows = await productsRepo.findAllMarketplace();
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const row = await productsRepo.findByIdMarketplace(id);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(row);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  getById
};
