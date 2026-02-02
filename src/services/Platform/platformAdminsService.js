const repo = require('../../repository/Platform/platformAdminsRepo');
const photosRepo = require('../../repository/Platform/platformAdminPhotosRepo');
const { hashPassword } = require('../../utils/password');

module.exports = {
  list: () => repo.findAll(),
  getById: (id) => repo.findById(id),
  create: async (data) => {
    const payload = { ...data };
    if (payload.password) {
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
    if (payload.password) {
      payload.password = await hashPassword(payload.password);
    }
    const avatarUrl = payload.avatar_url;
    delete payload.avatar_url;
    const result = await repo.update(id, payload);
    if (result.affectedRows) {
      await photosRepo.setActivePhoto(id, avatarUrl);
    }
    return result;
  },
  remove: (id) => repo.remove(id)
};
