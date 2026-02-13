import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat';
import fileRoutes from './routes/files';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/files', fileRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start Server
app.listen(port, () => {
    console.log(`Beagle AI Server running on port ${port}`);
});

export default app;
