const express = require('express');
const router = express.Router();
const { 
    getDashboard, 
    getUsers, 
    updateUser, 
    getAgents, 
    getCategories, 
    upsertCategory 
} = require('../controllers/adminController');
const { getReportData } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/dashboard', authorize('admin', 'manager'), getDashboard);
router.get('/reports', authorize('admin', 'manager'), getReportData);
router.get('/users', authorize('admin'), getUsers);
router.put('/users/:id', authorize('admin'), updateUser);
router.get('/agents', authorize('admin', 'manager', 'agent'), getAgents);

router.get('/categories', authorize('admin', 'manager', 'agent'), getCategories);
router.post('/categories', authorize('admin'), upsertCategory);

module.exports = router;
