function createService(repo) {
  return {
    list: () => repo.findAll(),
    getById: (id) => repo.findById(id),
    create: (data) => repo.create(data),
    update: (id, data) => repo.update(id, data),
    remove: (id) => repo.remove(id)
  };
}

module.exports = createService;
