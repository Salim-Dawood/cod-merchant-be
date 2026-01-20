const express = require('express');
const platformRoutes = require('./Platform');
const merchantRoutes = require('./Merchant');
const platformAdminsRoutes = require('./Platform/platformAdmins');
const platformRolesRoutes = require('./Platform/platformRoles');
const platformPermissionsRoutes = require('./Platform/platformPermissions');
const platformRolePermissionsRoutes = require('./Platform/platformRolePermissions');
const merchantsRoutes = require('./Merchant/merchants');
const branchesRoutes = require('./Merchant/branches');
const usersRoutes = require('./Merchant/users');
const permissionsRoutes = require('./Merchant/permissions');
const branchRolesRoutes = require('./Merchant/branchRoles');
const branchRolePermissionsRoutes = require('./Merchant/branchRolePermissions');

const router = express.Router();

router.use('/platform', platformRoutes);
router.use('/merchant', merchantRoutes);

router.use('/platform-admins', platformAdminsRoutes);
router.use('/platform-roles', platformRolesRoutes);
router.use('/platform-permissions', platformPermissionsRoutes);
router.use('/platform-role-permissions', platformRolePermissionsRoutes);
router.use('/merchants', merchantsRoutes);
router.use('/branches', branchesRoutes);
router.use('/users', usersRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/branch-roles', branchRolesRoutes);
router.use('/branch-role-permissions', branchRolePermissionsRoutes);

module.exports = router;
