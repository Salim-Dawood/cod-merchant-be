const express = require('express');
const merchantsRoutes = require('./merchants');
const branchesRoutes = require('./branches');
const usersRoutes = require('./users');
const permissionsRoutes = require('./permissions');
const branchRolesRoutes = require('./branchRoles');
const branchRolePermissionsRoutes = require('./branchRolePermissions');

const router = express.Router();

router.use('/merchants', merchantsRoutes);
router.use('/branches', branchesRoutes);
router.use('/users', usersRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/branch-roles', branchRolesRoutes);
router.use('/branch-role-permissions', branchRolePermissionsRoutes);

module.exports = router;
