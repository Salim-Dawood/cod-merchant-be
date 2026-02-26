const express = require('express');
const platformRoutes = require('./Platform');
const merchantRoutes = require('./Merchant');
const buyerRoutes = require('./Buyer');
const platformAuth = require('../middleware/platformAuth');
const requirePlatformPermission = require('../middleware/platformPermissions');
const allowPlatformOrMerchant = require('../middleware/platformOrMerchant');
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
const productsRoutes = require('./Merchant/products');
const categoriesRoutes = require('./Merchant/categories');
const productImagesRoutes = require('./Merchant/productImages');
const productCategoriesRoutes = require('./Merchant/productCategories');

const router = express.Router();

function allowPlatformOrMerchantRead(permissionMap) {
  return [
    allowPlatformOrMerchant(permissionMap),
    (req, res, next) => {
      if (req.merchant && req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return next();
    }
  ];
}

router.use('/platform', platformRoutes);
router.use('/merchant', merchantRoutes);
router.use('/buyer', buyerRoutes);

router.use(
  '/platform-admins',
  platformAuth,
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
  platformAuth,
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
  platformAuth,
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
  platformAuth,
  requirePlatformPermission({
    GET: 'view-platform-role-permission',
    POST: 'create-platform-role-permission',
    PUT: 'update-platform-role-permission',
    DELETE: 'delete-platform-role-permission'
  }),
  platformRolePermissionsRoutes
);
router.use(
  '/merchants',
  ...allowPlatformOrMerchantRead({
    GET: 'view-merchant',
    POST: 'create-merchant',
    PUT: 'update-merchant',
    DELETE: 'delete-merchant'
  }),
  merchantsRoutes
);
router.use(
  '/branches',
  ...allowPlatformOrMerchantRead({
    GET: 'view-branch',
    POST: 'create-branch',
    PUT: 'update-branch',
    DELETE: 'delete-branch'
  }),
  branchesRoutes
);
router.use(
  '/users',
  platformAuth,
  requirePlatformPermission({
    GET: 'view-user',
    POST: 'create-user',
    PUT: 'update-user',
    DELETE: 'delete-user'
  }),
  usersRoutes
);
router.use(
  '/permissions',
  platformAuth,
  requirePlatformPermission({
    GET: 'view-permission',
    POST: 'create-permission',
    PUT: 'update-permission',
    DELETE: 'delete-permission'
  }),
  permissionsRoutes
);
router.use(
  '/branch-roles',
  platformAuth,
  requirePlatformPermission({
    GET: 'view-branch-role',
    POST: 'create-branch-role',
    PUT: 'update-branch-role',
    DELETE: 'delete-branch-role'
  }),
  branchRolesRoutes
);
router.use(
  '/branch-role-permissions',
  platformAuth,
  requirePlatformPermission({
    GET: 'view-branch-role-permission',
    POST: 'create-branch-role-permission',
    PUT: 'update-branch-role-permission',
    DELETE: 'delete-branch-role-permission'
  }),
  branchRolePermissionsRoutes
);
router.use(
  '/products',
  allowPlatformOrMerchant({
    GET: 'view-product',
    POST: 'create-product',
    PUT: 'update-product',
    DELETE: 'delete-product'
  }),
  productsRoutes
);
router.use(
  '/categories',
  ...allowPlatformOrMerchantRead({
    GET: 'view-category',
    POST: 'create-category',
    PUT: 'update-category',
    DELETE: 'delete-category'
  }),
  categoriesRoutes
);
router.use(
  '/product-images',
  allowPlatformOrMerchant({
    GET: 'view-product-image',
    POST: 'create-product-image',
    PUT: 'update-product-image',
    DELETE: 'delete-product-image'
  }),
  productImagesRoutes
);
router.use(
  '/product-categories',
  allowPlatformOrMerchant({
    GET: 'view-product-category',
    POST: 'create-product-category',
    PUT: 'update-product-category',
    DELETE: 'delete-product-category'
  }),
  productCategoriesRoutes
);

module.exports = router;
