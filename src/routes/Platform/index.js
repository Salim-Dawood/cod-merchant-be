const express = require('express');
const platformAuth = require('../../middleware/platformAuth');
const requirePlatformPermission = require('../../middleware/platformPermissions');
const authRoutes = require('./auth');
const platformAdminsRoutes = require('./platformAdmins');
const platformRolesRoutes = require('./platformRoles');
const platformPermissionsRoutes = require('./platformPermissions');
const platformRolePermissionsRoutes = require('./platformRolePermissions');
const platformClientsRoutes = require('./platformClients');
const platformClientRolesRoutes = require('./platformClientRoles');

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
router.use(
  '/platform-clients',
  requirePlatformPermission({
    GET: 'view-platform-client',
    POST: 'create-platform-client',
    PUT: 'update-platform-client',
    DELETE: 'delete-platform-client'
  }),
  platformClientsRoutes
);
router.use(
  '/platform-client-roles',
  requirePlatformPermission({
    GET: 'view-platform-client-role',
    POST: 'create-platform-client-role',
    PUT: 'update-platform-client-role',
    DELETE: 'delete-platform-client-role'
  }),
  platformClientRolesRoutes
);

module.exports = router;
