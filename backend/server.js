const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
require('dotenv').config();

const logger = require('./logger');
const { authMiddleware } = require('./middleware/auth');
const { adminOnly } = require('./middleware/rbac');
const { authLimiter, securityHeaders } = require('./middleware/security');
const { problemFromError } = require('./middleware/problemJson');

const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const messageRoutes = require('./routes/messageRoutes');
const documentRoutes = require('./routes/documentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const keyRoutes = require('./routes/keyRoutes');
const metaRoutes = require('./routes/metaRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

let openApiDocument = null;
try {
    openApiDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));
} catch (e) {
    logger.warn({ err: e.message }, 'OpenAPI spec not loaded');
}

app.use(securityHeaders());
app.use(
    pinoHttp({
        logger,
        autoLogging: {
            ignore: (req) => req.url === '/api/health' || req.url === '/api/ready',
        },
    })
);
app.use(
    cors({
        origin: FRONTEND_ORIGIN,
        credentials: true,
    })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', metaRoutes);

if (openApiDocument) {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
}

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/posts', authMiddleware, postRoutes);
app.use('/api/messages', authMiddleware, messageRoutes);
app.use('/api/documents', authMiddleware, documentRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/admin', authMiddleware, adminOnly, adminRoutes);
app.use('/api/keys', authMiddleware, keyRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);

app.use((err, req, res, next) => {
    logger.error({ err }, 'Unhandled error');
    if (res.headersSent) {
        return next(err);
    }
    return problemFromError(res, err, 500);
});

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'CipherCampus server listening');
    });
}

module.exports = app;
