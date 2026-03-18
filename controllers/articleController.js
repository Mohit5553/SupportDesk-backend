const Article = require('../models/Article');

// @desc    Get articles with filtering/search
// @route   GET /api/articles
const getArticles = async (req, res, next) => {
    try {
        const { category, search, tags, all } = req.query;
        const query = {};

        // If not 'all', only show published
        if (all !== 'true') query.isPublished = true;
        
        // Admins/Managers can see everything if they ask for 'all'
        if (all === 'true' && !['admin', 'manager', 'agent'].includes(req.user?.role)) {
            query.isPublished = true;
        }

        if (category) query.category = category;
        if (tags) query.tags = { $in: tags.split(',') };
        if (search) {
            query.$text = { $search: search };
        }

        const articles = await Article.find(query)
            .populate('author', 'name')
            .sort('-createdAt');

        res.json({ success: true, articles });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single article by slug
// @route   GET /api/articles/:slug
const getArticle = async (req, res, next) => {
    try {
        const query = { slug: req.params.slug };
        
        // Non-staff can only see published articles
        if (!['admin', 'manager', 'agent'].includes(req.user?.role)) {
            query.isPublished = true;
        }

        const article = await Article.findOneAndUpdate(
            query,
            { $inc: { views: 1 } },
            { new: true }
        ).populate('author', 'name avatar');

        if (!article) return res.status(404).json({ success: false, message: 'Article not found' });
        res.json({ success: true, article });
    } catch (error) {
        next(error);
    }
};

// @desc    Create article
// @route   POST /api/articles
// @access  Private (agent, admin, manager)
const createArticle = async (req, res, next) => {
    try {
        const { title, content, category, tags, isPublished } = req.body;
        
        // Improved slug generation
        let slug = title.toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        
        // Ensure unique slug
        const existing = await Article.findOne({ slug });
        if (existing) {
            slug = `${slug}-${Date.now().toString().slice(-4)}`;
        }

        const article = await Article.create({
            title,
            slug,
            content,
            category,
            tags: tags?.split(',').map(t => t.trim()).filter(t => t),
            isPublished,
            author: req.user._id
        });

        res.status(201).json({ success: true, article });
    } catch (error) {
        next(error);
    }
};

// @desc    Vote article helpful
// @route   POST /api/articles/:id/helpful
const voteHelpful = async (req, res, next) => {
    try {
        const article = await Article.findByIdAndUpdate(
            req.params.id,
            { $inc: { helpfulVotes: 1 } },
            { new: true }
        );
        res.json({ success: true, helpfulVotes: article.helpfulVotes });
    } catch (error) {
        next(error);
    }
};

// @desc    Update article
// @route   PUT /api/articles/:id
const updateArticle = async (req, res, next) => {
    try {
        const { title, content, category, tags, isPublished } = req.body;
        const updateData = {
            content,
            category,
            isPublished,
            tags: tags?.split(',').map(t => t.trim()).filter(t => t),
        };

        if (title) {
            updateData.title = title;
            // Improved slug generation
            let slug = title.toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
            
            // Check for uniqueness (excluding current article)
            const existing = await Article.findOne({ slug, _id: { $ne: req.params.id } });
            if (existing) {
                slug = `${slug}-${Date.now().toString().slice(-4)}`;
            }
            updateData.slug = slug;
        }

        const article = await Article.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!article) return res.status(404).json({ success: false, message: 'Article not found' });
        res.json({ success: true, article });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete article
// @route   DELETE /api/articles/:id
const deleteArticle = async (req, res, next) => {
    try {
        const article = await Article.findByIdAndDelete(req.params.id);
        if (!article) return res.status(404).json({ success: false, message: 'Article not found' });
        res.json({ success: true, message: 'Article deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getArticles,
    getArticle,
    createArticle,
    updateArticle,
    deleteArticle,
    voteHelpful
};
