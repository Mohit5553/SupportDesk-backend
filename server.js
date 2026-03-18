const http = require('http');
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./utils/socket');
const logger = require('./utils/logger');
const { escalateTickets } = require('./utils/escalationLogic');

// Connect to MongoDB
connectDB();

// Escalation Job (Run every minute)
setInterval(escalateTickets, 60000);

const server = http.createServer(app);

// Attach Socket.io
initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`🛡️  Security: mongoSanitize + XSS protection active`);
    logger.info(`📧 Email: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
});
