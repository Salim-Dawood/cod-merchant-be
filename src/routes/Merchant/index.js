const express = require('express');
const createCrudRouter = require('../crudRouter');

const merchantsController = require('../../controllers/Merchant/merchantsController');
const branchesController = require('../../controllers/Merchant/branchesController');
const usersController = require('../../controllers/Merchant/usersController');
const permissionsController = require('../../controllers/Merchant/permissionsController');
const branchRolesController = require('../../controllers/Merchant/branchRolesController');
const branchRolePermissionsController = require('../../controllers/Merchant/branchRolePermissionsController');

const router = express.Router();

router.use('/merchants', createCrudRouter(merchantsController));
router.use('/branches', createCrudRouter(branchesController));
router.use('/users', createCrudRouter(usersController));
router.use('/permissions', createCrudRouter(permissionsController));
router.use('/branch-roles', createCrudRouter(branchRolesController));
router.use('/branch-role-permissions', createCrudRouter(branchRolePermissionsController));

module.exports = router;
