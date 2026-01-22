const express = require('express');
const allowPlatformOrMerchant = require('../../middleware/platformOrMerchant');
const authRoutes = require('./auth');
const merchantsRoutes = require('./merchants');
const branchesRoutes = require('./branches');
const usersRoutes = require('./users');
const permissionsRoutes = require('./permissions');
const branchRolesRoutes = require('./branchRoles');
const branchRolePermissionsRoutes = require('./branchRolePermissions');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(
  '/merchants',
  allowPlatformOrMerchant({
    GET: 'view-merchant',
    POST: 'create-merchant',
    PUT: 'update-merchant',
    DELETE: 'delete-merchant'
  }),
  merchantsRoutes
);
router.use(
  '/branches',
  allowPlatformOrMerchant({
    GET: 'view-branch',
    POST: 'create-branch',
    PUT: 'update-branch',
    DELETE: 'delete-branch'
  }),
  branchesRoutes
);
router.use(
  '/users',
  allowPlatformOrMerchant({
    GET: 'view-user',
    POST: 'create-user',
    PUT: 'update-user',
    DELETE: 'delete-user'
  }),
  usersRoutes
);
router.use(
  '/permissions',
  allowPlatformOrMerchant({
    GET: 'view-permission',
    POST: 'create-permission',
    PUT: 'update-permission',
    DELETE: 'delete-permission'
  }),
  permissionsRoutes
);
router.use(
  '/branch-roles',
  allowPlatformOrMerchant({
    GET: 'view-branch-role',
    POST: 'create-branch-role',
    PUT: 'update-branch-role',
    DELETE: 'delete-branch-role'
  }),
  branchRolesRoutes
);
router.use(
  '/branch-role-permissions',
  allowPlatformOrMerchant({
    GET: 'view-branch-role-permission',
    POST: 'create-branch-role-permission',
    PUT: 'update-branch-role-permission',
    DELETE: 'delete-branch-role-permission'
  }),
  branchRolePermissionsRoutes
);

module.exports = router;
