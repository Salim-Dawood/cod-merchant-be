const jwt = require('jsonwebtoken');
const platformAdminsRepo = require('../repository/Platform/platformAdminsRepo');

function getPlatformToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.cookies?.access_token || null;
}

function getMerchantToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.cookies?.merchant_access_token || null;
}

function allowPlatformOrMerchant(permissionMap) {
  return async (req, res, next) => {
    try {
      const platformToken = getPlatformToken(req);
      if (platformToken) {
        const payload = jwt.verify(platformToken, process.env.JWT_ACCESS_SECRET);
        if (payload?.type === 'platform') {
          req.user = payload;
          if (process.env.PLATFORM_ADMIN_FULL_ACCESS === 'true' && req.user?.type === 'platform') {
            return next();
          }
          const method = req.method === 'HEAD' ? 'GET' : req.method;
          const required = permissionMap[method];
          if (!required) {
            return next();
          }
          if (!req.permissions) {
            req.permissions = await platformAdminsRepo.getPermissions(req.user.sub);
          }
          if (!req.permissions.includes(required)) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          return next();
        }
      }

      const merchantToken = getMerchantToken(req);
      if (!merchantToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const payload = jwt.verify(merchantToken, process.env.JWT_ACCESS_SECRET);
      if (payload.type !== 'merchant') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      req.merchant = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

module.exports = allowPlatformOrMerchant;
