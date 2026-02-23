const repo = require('../../repository/Platform/platformClientsRepo');
const { hashPassword, isHashed } = require('../../utils/password');

module.exports = {
  list: () => repo.findAll(),
  getById: (id) => repo.findById(id),
  create: async (data) => {
    const payload = { ...data };
    if (payload.password && !isHashed(payload.password)) {
      payload.password = await hashPassword(payload.password);
    }
    return repo.create(payload);
  },
  update: async (id, data) => {
    const payload = { ...data };
    if (payload.password && !isHashed(payload.password)) {
      payload.password = await hashPassword(payload.password);
    }
    return repo.update(id, payload);
  },
  remove: (id) => repo.remove(id)
};
