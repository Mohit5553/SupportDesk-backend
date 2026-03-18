const Chat = require('../models/Chat');
const { emitChatMessage, broadcastActiveChats, sendNotification } = require('../utils/socket');

// @desc    Start or get active chat
// @route   POST /api/chat/init
// @access  Private (Customer)
exports.initChat = async (req, res, next) => {
    try {
        let chat = await Chat.findOne({
            customer: req.user._id,
            status: { $in: ['waiting', 'active'] }
        }).populate('agent', 'name avatar');

        if (!chat) {
            chat = await Chat.create({
                customer: req.user._id,
                status: 'waiting'
            });
            // Alert agents
            broadcastActiveChats({ type: 'NEW_CHAT', chat });
        }

        res.status(200).json({ success: true, chat });
    } catch (error) {
        next(error);
    }
};

// @desc    Get chat session
// @route   GET /api/chat/:id
// @access  Private
exports.getChat = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id)
            .populate('customer', 'name avatar email')
            .populate('agent', 'name avatar')
            .populate('messages.sender', 'name avatar role');

        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        res.status(200).json({ success: true, chat });
    } catch (error) {
        next(error);
    }
};

// @desc    Send a message in chat
// @route   POST /api/chat/:id/messages
// @access  Private
exports.sendMessage = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id);
        
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        if (chat.status === 'closed') {
            return res.status(400).json({ success: false, message: 'Chat is closed' });
        }

        const msgData = {
            sender: req.user._id,
            text: req.body.text,
            createdAt: new Date()
        };

        chat.messages.push(msgData);
        await chat.save();

        const populatedChat = await Chat.findById(req.params.id).populate('messages.sender', 'name avatar role');
        const finalMsg = populatedChat.messages[populatedChat.messages.length - 1];

        // Emit over socket
        emitChatMessage(chat._id.toString(), finalMsg);

        res.status(200).json({ success: true, message: finalMsg });
    } catch (error) {
        next(error);
    }
};

// @desc    Get active/waiting chats (Agent/Manager)
// @route   GET /api/chat
// @access  Private (Agent/Manager/Admin)
exports.getChats = async (req, res, next) => {
    try {
        const chats = await Chat.find({
            status: { $in: ['waiting', 'active'] }
        })
        .populate('customer', 'name avatar email')
        .populate('agent', 'name avatar')
        .sort('-startedAt');

        res.status(200).json({ success: true, chats });
    } catch (error) {
        next(error);
    }
};

// @desc    Accept chat
// @route   PUT /api/chat/:id/accept
// @access  Private (Agent/Manager/Admin)
exports.acceptChat = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id);
        
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        if (chat.status !== 'waiting') {
            return res.status(400).json({ success: false, message: 'Chat is already active or closed' });
        }

        chat.agent = req.user._id;
        chat.status = 'active';
        await chat.save();

        broadcastActiveChats({ type: 'CHAT_ACCEPTED', chatId: chat._id });
        sendNotification(chat.customer.toString(), {
            type: 'CHAT_ACCEPTED',
            message: `An agent has joined the chat!`,
            chatId: chat._id
        });

        const updatedChat = await Chat.findById(req.params.id)
            .populate('customer', 'name avatar email')
            .populate('agent', 'name avatar');

        res.status(200).json({ success: true, chat: updatedChat });
    } catch (error) {
        next(error);
    }
};

// @desc    End chat
// @route   PUT /api/chat/:id/end
// @access  Private
exports.endChat = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id);
        
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        chat.status = 'closed';
        chat.closedAt = new Date();
        await chat.save();

        broadcastActiveChats({ type: 'CHAT_CLOSED', chatId: chat._id });
        
        // Let the other party know the chat ended
        emitChatMessage(chat._id.toString(), {
            system: true,
            text: 'Chat has been ended.'
        });

        res.status(200).json({ success: true, message: 'Chat closed successfully' });
    } catch (error) {
        next(error);
    }
};
