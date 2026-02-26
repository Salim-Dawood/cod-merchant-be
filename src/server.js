require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { uploadDir } = require('./utils/upload');

const app = express();
app.set('trust proxy', 1);

const apiRoutes = require('./routes');

function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '-';
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms - ${ip}`
    );
  });
  next();
}

const defaultOrigins = ['http://localhost:5173', 'https://cod-merchant-frontend-1.onrender.com'];
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const corsOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));
app.use(requestLogger);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDir));
app.use('/api/v1', apiRoutes);

app.get('/', (req, res) => {
  res.status(200).send('Backend is running ✅');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
