import express from 'express';
import cors from 'cors';
import scanRouter from './routes/scan.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', scanRouter);

/** Configured Express application (not yet listening). */
export default app;
