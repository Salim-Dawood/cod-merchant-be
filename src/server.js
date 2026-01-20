require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

const apiRoutes = require('./routes');

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', apiRoutes);

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
