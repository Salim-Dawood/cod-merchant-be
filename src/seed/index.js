require('dotenv').config();

const pool = require('../db');
const { buildInsert } = require('../repository/common');
const { hashPassword } = require('../utils/password');

async function getOrCreate(table, whereClause, whereParams, data) {
  const [rows] = await pool.query(
    `SELECT id FROM ${table} WHERE ${whereClause} LIMIT 1`,
    whereParams
  );
  if (rows.length) {
    return rows[0].id;
  }
  const stmt = buildInsert(table, data, Object.keys(data));
  if (!stmt) {
    return null;
  }
  const [result] = await pool.query(stmt.sql, stmt.params);
  return result.insertId;
}

async function seedMerchantPermissions(actions) {
  const merchantPermissionResources = [
    { key: 'merchant', group: 'Merchant' },
    { key: 'branch', group: 'Merchant' },
    { key: 'user', group: 'Merchant' },
    { key: 'permission', group: 'Merchant' },
    { key: 'branch-role', group: 'Merchant' },
    { key: 'branch-role-permission', group: 'Merchant' },
    { key: 'product', group: 'Catalog' },
    { key: 'category', group: 'Catalog' },
    { key: 'product-image', group: 'Catalog' },
    { key: 'product-category', group: 'Catalog' },
    { key: 'order', group: 'Orders' }
  ];

  for (const resource of merchantPermissionResources) {
    for (const action of actions) {
      await getOrCreate(
        'permissions',
        'key_name = ?',
        [`${action.key}-${resource.key}`],
        {
          key_name: `${action.key}-${resource.key}`,
          description: `${action.label} ${resource.key.replace(/-/g, ' ')}`,
          group_name: resource.group
        }
      );
    }
  }
}

async function seedBuyerPermissions() {
  const buyerPermissions = [
    { name: 'place_orders', description: 'Place orders', module: 'orders' },
    { name: 'approve_orders', description: 'Approve orders', module: 'orders' },
    { name: 'view_orders', description: 'View orders', module: 'orders' },
    { name: 'view_invoices', description: 'View invoices', module: 'invoices' },
    { name: 'manage_addresses', description: 'Manage company addresses', module: 'buyers' },
    { name: 'manage_payment_methods', description: 'Manage payment methods', module: 'buyers' },
    { name: 'manage_team', description: 'Manage buyer team members', module: 'buyers' },
    { name: 'view_reports', description: 'View buyer reports', module: 'reports' }
  ];

  try {
    for (const perm of buyerPermissions) {
      await getOrCreate(
        'buyer_permissions',
        'name = ?',
        [perm.name],
        perm
      );
    }
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return;
    }
    throw err;
  }
}

async function run() {
  const permissionResources = [
    { key: 'platform-admin', group: 'Platform' },
    { key: 'platform-role', group: 'Platform' },
    { key: 'platform-permission', group: 'Platform' },
    { key: 'platform-role-permission', group: 'Platform' },
    { key: 'merchant', group: 'Merchant' },
    { key: 'branch', group: 'Merchant' },
    { key: 'user', group: 'Merchant' },
    { key: 'permission', group: 'Merchant' },
    { key: 'branch-role', group: 'Merchant' },
    { key: 'branch-role-permission', group: 'Merchant' },
    { key: 'product', group: 'Catalog' },
    { key: 'category', group: 'Catalog' },
    { key: 'product-image', group: 'Catalog' },
    { key: 'product-category', group: 'Catalog' }
  ];
  const actions = [
    { key: 'create', label: 'Create' },
    { key: 'view', label: 'View' },
    { key: 'update', label: 'Update' },
    { key: 'delete', label: 'Delete' }
  ];

  for (const resource of permissionResources) {
    for (const action of actions) {
      await getOrCreate(
        'platform_permissions',
        'key_name = ?',
        [`${action.key}-${resource.key}`],
        {
          key_name: `${action.key}-${resource.key}`,
          description: `${action.label} ${resource.key.replace(/-/g, ' ')}`,
          group_name: resource.group
        }
      );
    }
  }

  await seedMerchantPermissions(actions);
  await seedBuyerPermissions();

  const superAdminRoleId = await getOrCreate(
    'platform_roles',
    'name = ?',
    ['Super Admin'],
    { name: 'Super Admin', description: 'Full access', is_system: true }
  );

  const supportRoleId = await getOrCreate(
    'platform_roles',
    'name = ?',
    ['Support'],
    { name: 'Support', description: 'Support staff', is_system: true }
  );
  const [platformPermissions] = await pool.query('SELECT id FROM platform_permissions');
  for (const perm of platformPermissions) {
    await getOrCreate(
      'platform_role_permissions',
      'platform_role_id = ? AND platform_permission_id = ?',
      [superAdminRoleId, perm.id],
      { platform_role_id: superAdminRoleId, platform_permission_id: perm.id }
    );
  }

  const approveMerchantPermId = await getOrCreate(
    'platform_permissions',
    'key_name = ?',
    ['approve-merchant'],
    { key_name: 'approve-merchant', description: 'Approve merchant', group_name: 'Merchants' }
  );

  const suspendBranchPermId = await getOrCreate(
    'platform_permissions',
    'key_name = ?',
    ['suspend-branch'],
    { key_name: 'suspend-branch', description: 'Suspend branch', group_name: 'Merchants' }
  );

  await getOrCreate(
    'platform_role_permissions',
    'platform_role_id = ? AND platform_permission_id = ?',
    [supportRoleId, approveMerchantPermId],
    { platform_role_id: supportRoleId, platform_permission_id: approveMerchantPermId }
  );

  await getOrCreate(
    'platform_admins',
    'email = ?',
    ['admin@cod-merchant.local'],
    {
      platform_role_id: superAdminRoleId,
      email: 'admin@cod-merchant.local',
      password: await hashPassword('change-me'),
      status: 'active'
    }
  );
  const merchantId = await getOrCreate(
    'merchants',
    'merchant_code = ?',
    ['M0001'],
    {
      merchant_code: 'M0001',
      name: 'Demo Merchant',
      legal_name: 'Demo Merchant LLC',
      email: 'merchant@cod-merchant.local',
      phone: '+10000000000',
      country: 'US',
      city: 'New York',
      address: '123 Demo Street',
      status: 'active'
    }
  );

  const branchId = await getOrCreate(
    'branches',
    'code = ?',
    ['BR001'],
    {
      merchant_id: merchantId,
      parent_branch_id: null,
      name: 'HQ',
      code: 'BR001',
      type: 'hq',
      is_main: true,
      status: 'active'
    }
  );

  const createProductPermId = await getOrCreate(
    'permissions',
    'key_name = ?',
    ['create-product'],
    { key_name: 'create-product', description: 'Create product', group_name: 'Catalog' }
  );

  const viewOrdersPermId = await getOrCreate(
    'permissions',
    'key_name = ?',
    ['view-order'],
    { key_name: 'view-order', description: 'View order', group_name: 'Orders' }
  );

  const managerRoleId = await getOrCreate(
    'branch_roles',
    'branch_id = ? AND name = ?',
    [branchId, 'Manager'],
    { branch_id: branchId, name: 'Manager', description: 'Branch manager', is_system: true }
  );

  await getOrCreate(
    'branch_role_permissions',
    'branch_role_id = ? AND permission_id = ?',
    [managerRoleId, createProductPermId],
    { branch_role_id: managerRoleId, permission_id: createProductPermId }
  );

  await getOrCreate(
    'branch_role_permissions',
    'branch_role_id = ? AND permission_id = ?',
    [managerRoleId, viewOrdersPermId],
    { branch_role_id: managerRoleId, permission_id: viewOrdersPermId }
  );

  await getOrCreate(
    'users',
    'email = ?',
    ['manager@cod-merchant.local'],
    {
      merchant_id: merchantId,
      branch_id: branchId,
      merchant_role_id: managerRoleId,
      email: 'manager@cod-merchant.local',
      phone: '+10000000001',
      password: await hashPassword('change-me'),
      status: 'active'
    }
  );

  const [permissionRows] = await pool.query('SELECT id, key_name FROM permissions');
  const permissionMap = new Map(permissionRows.map((row) => [row.key_name, row.id]));
  const allPermissionIds = permissionRows.map((row) => row.id);

  const assignRolePermissions = async (roleId, keys) => {
    const ids = keys === 'all'
      ? allPermissionIds
      : keys.map((key) => permissionMap.get(key)).filter(Boolean);
    for (const permId of ids) {
      await getOrCreate(
        'branch_role_permissions',
        'branch_role_id = ? AND permission_id = ?',
        [roleId, permId],
        { branch_role_id: roleId, permission_id: permId }
      );
    }
  };

  const createBranchRolesAndUsers = async ({ merchantId, branchId, branchCode, label }) => {
    const roleTemplates = [
      { name: 'Manager', description: 'Branch manager', permissions: 'all' },
      { name: 'Support', description: 'Support staff', permissions: ['view-merchant', 'view-branch', 'view-user', 'view-product', 'view-category', 'view-order'] },
      { name: 'Cashier', description: 'Front desk cashier', permissions: ['view-order', 'create-order', 'update-order'] },
      { name: 'Inventory', description: 'Inventory specialist', permissions: ['view-product', 'create-product', 'update-product', 'view-category', 'create-category', 'update-category'] }
    ];

    for (const template of roleTemplates) {
      const roleId = await getOrCreate(
        'branch_roles',
        'branch_id = ? AND name = ?',
        [branchId, template.name],
        { branch_id: branchId, name: template.name, description: template.description, is_system: true }
      );
      await assignRolePermissions(roleId, template.permissions);

      const emailLocal = `${template.name.toLowerCase()}-${branchCode}`.replace(/\s+/g, '');
      await getOrCreate(
        'users',
        'email = ?',
        [`${emailLocal}@cod-merchant.example`],
        {
          merchant_id: merchantId,
          branch_id: branchId,
          merchant_role_id: roleId,
          email: `${emailLocal}@cod-merchant.example`,
          phone: `+96170000${String(branchId).padStart(2, '0')}`,
          password: await hashPassword('change-me'),
          status: 'active'
        }
      );
    }
  };

  const categorySeeds = [
    { name: 'Sandwiches', slug: 'sandwiches' },
    { name: 'Meals', slug: 'meals' },
    { name: 'Breads', slug: 'breads' },
    { name: 'Pastries', slug: 'pastries' },
    { name: 'Beverages', slug: 'beverages' }
  ];

  const categoryIds = {};
  for (const category of categorySeeds) {
    const id = await getOrCreate(
      'categories',
      'slug = ?',
      [category.slug],
      { ...category, is_active: 1 }
    );
    categoryIds[category.slug] = id;
  }

  const merchants = [
    {
      code: 'MAT001',
      name: 'Malak Al Tawouk',
      legal_name: 'Malak Al Tawouk SARL',
      email: 'info@malakaltawouk.example',
      phone: '+9611700001',
      country: 'LB',
      city: 'Beirut',
      address: 'Hamra Street',
      branches: [
        { code: 'MAT-HQ', name: 'Malak HQ', type: 'hq', city: 'Beirut', is_main: 1 },
        { code: 'MAT-HAM', name: 'Hamra Branch', type: 'store', city: 'Beirut', is_main: 0 },
        { code: 'MAT-ACH', name: 'Achrafieh Branch', type: 'store', city: 'Beirut', is_main: 0 }
      ],
      products: [
        { name: 'Classic Tawouk', slug: 'classic-tawouk', category: 'sandwiches' },
        { name: 'Spicy Tawouk', slug: 'spicy-tawouk', category: 'sandwiches' },
        { name: 'Tawouk Meal', slug: 'tawouk-meal', category: 'meals' }
      ]
    },
    {
      code: 'WB001',
      name: 'Wooden Bakery',
      legal_name: 'Wooden Bakery SAL',
      email: 'hello@woodenbakery.example',
      phone: '+9611700002',
      country: 'LB',
      city: 'Beirut',
      address: 'Verdun Street',
      branches: [
        { code: 'WB-HQ', name: 'Wooden HQ', type: 'hq', city: 'Beirut', is_main: 1 },
        { code: 'WB-DB', name: 'Downtown Branch', type: 'store', city: 'Beirut', is_main: 0 },
        { code: 'WB-JN', name: 'Jounieh Branch', type: 'store', city: 'Jounieh', is_main: 0 }
      ],
      products: [
        { name: 'Baguette', slug: 'baguette', category: 'breads' },
        { name: 'Chocolate Croissant', slug: 'chocolate-croissant', category: 'pastries' },
        { name: 'Iced Latte', slug: 'iced-latte', category: 'beverages' }
      ]
    }
  ];

  for (const merchant of merchants) {
    const merchantId = await getOrCreate(
      'merchants',
      'merchant_code = ?',
      [merchant.code],
      {
        merchant_code: merchant.code,
        name: merchant.name,
        legal_name: merchant.legal_name,
        email: merchant.email,
        phone: merchant.phone,
        country: merchant.country,
        city: merchant.city,
        address: merchant.address,
        status: 'active'
      }
    );

    for (const branch of merchant.branches) {
      const branchId = await getOrCreate(
        'branches',
        'code = ?',
        [branch.code],
        {
          merchant_id: merchantId,
          parent_branch_id: null,
          name: branch.name,
          code: branch.code,
          type: branch.type,
          is_main: branch.is_main,
          status: 'active'
        }
      );
      await createBranchRolesAndUsers({
        merchantId,
        branchId,
        branchCode: branch.code.toLowerCase(),
        label: branch.name
      });

      for (const product of merchant.products) {
        const productId = await getOrCreate(
          'products',
          'slug = ? AND branch_id = ?',
          [`${product.slug}-${branch.code.toLowerCase()}`, branchId],
          {
            branch_id: branchId,
            name: product.name,
            slug: `${product.slug}-${branch.code.toLowerCase()}`,
            description: `${product.name} from ${merchant.name}`,
            status: 'active',
            is_active: 1
          }
        );

        const categoryId = categoryIds[product.category];
        if (productId && categoryId) {
          await getOrCreate(
            'product_categories',
            'product_id = ? AND category_id = ?',
            [productId, categoryId],
            { product_id: productId, category_id: categoryId, is_active: 1 }
          );
        }
      }
    }
  }
}

run()
  .then(() => {
    console.log('Seed completed');
    return pool.end();
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    return pool.end().finally(() => process.exit(1));
  });
