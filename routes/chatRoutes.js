const express = require('express');
const router = express.Router();
const {
    initChat,
    getChat,
    sendMessage,
    getChats,
    acceptChat,
    endChat
} = require('../controllers/chatController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/init', initChat);
router.get('/', authorize('agent', 'manager', 'admin'), getChats);
router.get('/:id', getChat);
router.post('/:id/messages', sendMessage);
router.put('/:id/accept', authorize('agent', 'manager', 'admin'), acceptChat);
router.put('/:id/end', endChat);

module.exports = router;
