const express = require('express');
const router = express.Router();
const {
    createTicket,
    getTickets,
    getTicket,
    updateTicketStatus,
    assignTicket,
    addComment,
    submitFeedback,
    deleteTicket,
    getCategories,
    bulkAction,
} = require('../controllers/ticketController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Publicly accessible categories for ticket creation lookup
router.get('/categories', getCategories);

router.use(protect); // All other ticket routes require authentication

router
    .route('/')
    .get(getTickets)
    .post(upload.array('attachments', 5), createTicket);

router.route('/:id').get(getTicket).delete(authorize('admin'), deleteTicket);

router.put('/:id/status', authorize('agent', 'manager', 'admin'), updateTicketStatus);
router.put('/:id/assign', authorize('manager', 'admin'), assignTicket);
router.post('/:id/comments', upload.array('attachments', 3), addComment);
router.post('/:id/feedback', submitFeedback);
router.post('/bulk', authorize('agent', 'manager', 'admin'), bulkAction);

module.exports = router;
