const express = require('express');
const createCrudRouter = require('../crudRouter');

const platformAdminsController = require('../../controllers/Platform/platformAdminsController');
const platformRolesController = require('../../controllers/Platform/platformRolesController');
const platformPermissionsController = require('../../controllers/Platform/platformPermissionsController');
const platformRolePermissionsController = require('../../controllers/Platform/platformRolePermissionsController');

const router = express.Router();

router.use('/platform-admins', createCrudRouter(platformAdminsController));
router.use('/platform-roles', createCrudRouter(platformRolesController));
router.use('/platform-permissions', createCrudRouter(platformPermissionsController));
router.use('/platform-role-permissions', createCrudRouter(platformRolePermissionsController));

module.exports = router;
