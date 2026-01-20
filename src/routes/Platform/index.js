const express = require('express');
const platformAdminsRoutes = require('./platformAdmins');
const platformRolesRoutes = require('./platformRoles');
const platformPermissionsRoutes = require('./platformPermissions');
const platformRolePermissionsRoutes = require('./platformRolePermissions');

const router = express.Router();

router.use('/platform-admins', platformAdminsRoutes);
router.use('/platform-roles', platformRolesRoutes);
router.use('/platform-permissions', platformPermissionsRoutes);
router.use('/platform-role-permissions', platformRolePermissionsRoutes);

module.exports = router;
