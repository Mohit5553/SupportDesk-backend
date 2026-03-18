const express = require('express');
const router = express.Router();
const { 
    getArticles, 
    getArticle, 
    createArticle, 
    updateArticle,
    deleteArticle,
    voteHelpful 
} = require('../controllers/articleController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getArticles);
router.get('/:slug', protect, getArticle);
router.post('/', protect, authorize('agent', 'manager', 'admin'), createArticle);
router.put('/:id', protect, authorize('agent', 'manager', 'admin'), updateArticle);
router.delete('/:id', protect, authorize('agent', 'manager', 'admin'), deleteArticle);
router.post('/:id/helpful', voteHelpful);

module.exports = router;
