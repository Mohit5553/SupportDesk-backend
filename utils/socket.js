const socketio = require('socket.io');

let io;

const initSocket = (server) => {
    io = socketio(server, {
        cors: {
            origin: [
                "http://localhost:5173",
                "https://support-desk-frontend-mu.vercel.app",
                "https://support-desk-frontend-nizicmd74-jts-projects-0424a64c.vercel.app"
            ],
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`New connection: ${socket.id}`);

        socket.on('join', (userId) => {
            socket.join(userId);
            console.log(`User ${userId} joined their notification room`);
        });

        socket.on('join-admins', () => {
            socket.join('admins');
            console.log('User joined admin room');
        });

        socket.on('join-chat', (chatId) => {
            socket.join(`chat_${chatId}`);
            console.log(`User joined chat room: chat_${chatId}`);
        });

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

// Notification Helper
const sendNotification = (userId, data) => {
    if (io) {
        io.to(userId).emit('notification', data);
    }
};

const broadcastToAdmins = (data) => {
    if (io) {
        io.to('admins').emit('admin-notification', data);
    }
};

// Chat Helpers
const emitChatMessage = (chatId, messageData) => {
    if (io) {
        io.to(`chat_${chatId}`).emit('new-chat-message', messageData);
    }
};

const broadcastActiveChats = (chatData) => {
    if (io) {
        io.to('admins').emit('chat-updated', chatData);
    }
}

module.exports = { initSocket, getIO, sendNotification, broadcastToAdmins, emitChatMessage, broadcastActiveChats };
