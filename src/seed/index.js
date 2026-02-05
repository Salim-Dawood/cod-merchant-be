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
