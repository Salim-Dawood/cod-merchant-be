function createService(repo) {
  return {
    list: () => repo.findAll(),
    listForMerchant: (merchant) => {
      if (!merchant) {
        return repo.findAll();
      }
      if (typeof repo.findAllForMerchant === 'function') {
        return repo.findAllForMerchant(merchant);
      }
      if (typeof repo.findAllByBranch === 'function') {
        return repo.findAllByBranch(merchant.branch_id);
      }
      return repo.findAll();
    },
    getById: (id) => repo.findById(id),
    create: (data) => repo.create(data),
    update: (id, data) => repo.update(id, data),
    remove: (id) => repo.remove(id)
  };
}

module.exports = createService;
