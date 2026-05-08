const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const { authMiddleware } = require('./middleware/auth');
const { adminOnly } = require('./middleware/rbac');

// Import routes
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const messageRoutes = require('./routes/messageRoutes');
const documentRoutes = require('./routes/documentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const keyRoutes = require('./routes/keyRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', authMiddleware, postRoutes);
app.use('/api/messages', authMiddleware, messageRoutes);
app.use('/api/documents', authMiddleware, documentRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/admin', authMiddleware, adminOnly, adminRoutes);
app.use('/api/keys', authMiddleware, keyRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`CipherCampus server running on port ${PORT}`);
    console.log(`https://localhost:${PORT}`);
});