import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import copilotRouter from './routes/copilot.js';
import filesRouter from './routes/files.js';
import terminalRouter from './routes/terminal.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Autoriser les requêtes sans origine (comme curl) ou venant de localhost (peu importe le port)
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/copilot', copilotRouter);
app.use('/api/files', filesRouter);
app.use('/api/terminal', terminalRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur', 
    message: err.message 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Client autorisé: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
});
