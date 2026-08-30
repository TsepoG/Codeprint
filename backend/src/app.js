import express from 'express';
import cors from 'cors';
import scanRouter from './routes/scan.js';
import scansRouter from './routes/scans.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', scanRouter);
app.use('/api', scansRouter);

/** Configured Express application (not yet listening). */
export default app;
