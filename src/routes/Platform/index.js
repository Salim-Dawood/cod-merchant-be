const express = require('express');
const platformAuth = require('../../middleware/platformAuth');
const requirePlatformPermission = require('../../middleware/platformPermissions');
const authRoutes = require('./auth');
const platformAdminsRoutes = require('./platformAdmins');
const platformRolesRoutes = require('./platformRoles');
const platformPermissionsRoutes = require('./platformPermissions');
const platformRolePermissionsRoutes = require('./platformRolePermissions');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(platformAuth);
router.use(
  '/platform-admins',
  requirePlatformPermission({
    GET: 'view-platform-admin',
    POST: 'create-platform-admin',
    PUT: 'update-platform-admin',
    DELETE: 'delete-platform-admin'
  }),
  platformAdminsRoutes
);
router.use(
  '/platform-roles',
  requirePlatformPermission({
    GET: 'view-platform-role',
    POST: 'create-platform-role',
    PUT: 'update-platform-role',
    DELETE: 'delete-platform-role'
  }),
  platformRolesRoutes
);
router.use(
  '/platform-permissions',
  requirePlatformPermission({
    GET: 'view-platform-permission',
    POST: 'create-platform-permission',
    PUT: 'update-platform-permission',
    DELETE: 'delete-platform-permission'
  }),
  platformPermissionsRoutes
);
router.use(
  '/platform-role-permissions',
  requirePlatformPermission({
    GET: 'view-platform-role-permission',
    POST: 'create-platform-role-permission',
    PUT: 'update-platform-role-permission',
    DELETE: 'delete-platform-role-permission'
  }),
  platformRolePermissionsRoutes
);
module.exports = router;
