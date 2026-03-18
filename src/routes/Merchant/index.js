const express = require('express');
const allowPlatformOrMerchant = require('../../middleware/platformOrMerchant');
const authRoutes = require('./auth');
const merchantsRoutes = require('./merchants');
const branchesRoutes = require('./branches');
const usersRoutes = require('./users');
const permissionsRoutes = require('./permissions');
const branchRolesRoutes = require('./branchRoles');
const branchRolePermissionsRoutes = require('./branchRolePermissions');
const productsRoutes = require('./products');
const categoriesRoutes = require('./categories');
const productImagesRoutes = require('./productImages');
const productCategoriesRoutes = require('./productCategories');

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
  allowPlatformOrMerchant({
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
