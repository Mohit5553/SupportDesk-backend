const mongoose = require('mongoose');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Category = require('../models/Category');
const Article = require('../models/Article');

// @desc    Get dashboard analytics
// @route   GET /api/admin/dashboard
// @access  Private (admin, manager)
const getDashboard = async (req, res, next) => {
    try {
        const [
            totalTickets,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            closedTickets,
            criticalTickets,
            totalUsers,
            totalAgents,
        ] = await Promise.all([
            Ticket.countDocuments(),
            Ticket.countDocuments({ status: 'Open' }),
            Ticket.countDocuments({ status: { $in: ['Assigned', 'In Progress', 'Pending'] } }),
            Ticket.countDocuments({ status: 'Resolved' }),
            Ticket.countDocuments({ status: 'Closed' }),
            Ticket.countDocuments({ priority: 'Critical', status: { $nin: ['Resolved', 'Closed'] } }),
            User.countDocuments({ role: 'customer' }),
            User.countDocuments({ role: { $in: ['agent', 'manager'] } }),
        ]);

        // Tickets by category
        const byCategory = await Ticket.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        // Tickets by priority
        const byPriority = await Ticket.aggregate([
            { $group: { _id: '$priority', count: { $sum: 1 } } },
        ]);

        // Tickets by current level
        const byLevel = await Ticket.aggregate([
            { $match: { status: { $nin: ['Resolved', 'Closed'] } } },
            { $group: { _id: '$currentLevel', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        // Tickets per day (last 7 days)
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);
        // SLA Breaches per day (last 7 days)
        const slaBreachedOverTime = await Ticket.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: last7Days },
                    slaDeadline: { $lt: new Date() },
                    status: { $nin: ['Resolved', 'Closed'] }
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const ticketsOverTime = await Ticket.aggregate([
            { $match: { createdAt: { $gte: last7Days } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Agent performance (ticket count + avg resolution time)
        const agentPerformance = await Ticket.aggregate([
            { $match: { assignedTo: { $ne: null } } },
            {
                $group: {
                    _id: '$assignedTo',
                    totalAssigned: { $sum: 1 },
                    resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
                    avgResolutionMs: {
                        $avg: {
                            $cond: [
                                { $and: [{ $ne: ['$resolvedAt', null] }, { $ne: ['$createdAt', null] }] },
                                { $subtract: ['$resolvedAt', '$createdAt'] },
                                null,
                            ],
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'agent',
                },
            },
            { $unwind: '$agent' },
            {
                $project: {
                    agentName: '$agent.name',
                    agentEmail: '$agent.email',
                    totalAssigned: 1,
                    resolved: 1,
                    avgResolutionHours: { $divide: ['$avgResolutionMs', 3600000] },
                },
            },
        ]);

        // Total SLA breached count
        const slaBreached = await Ticket.countDocuments({
            slaDeadline: { $lt: new Date() },
            status: { $nin: ['Resolved', 'Closed'] },
        });

        // SLA breached by category
        const slaByCategory = await Ticket.aggregate([
            { $match: { slaDeadline: { $lt: new Date() }, status: { $nin: ['Resolved', 'Closed'] } } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // SLA breached by level
        const slaByLevel = await Ticket.aggregate([
            { $match: { slaDeadline: { $lt: new Date() }, status: { $nin: ['Resolved', 'Closed'] } } },
            { $group: { _id: '$currentLevel', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        // Tickets by subcategory (top 10)
        const bySubcategory = await Ticket.aggregate([
            { $match: { subcategory: { $ne: null } } },
            { $group: { _id: '$subcategory', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Average Resolution Time per Category
        const avgResolutionTimeByCategory = await Ticket.aggregate([
            { $match: { status: 'Resolved', resolvedAt: { $ne: null } } },
            {
                $group: {
                    _id: '$category',
                    avgHours: {
                        $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] }
                    }
                }
            },
            { $sort: { avgHours: -1 } }
        ]);

        // Average Resolution Time per Priority
        const avgResolutionTimeByPriority = await Ticket.aggregate([
            { $match: { status: 'Resolved', resolvedAt: { $ne: null } } },
            {
                $group: {
                    _id: '$priority',
                    avgHours: {
                        $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] }
                    }
                }
            },
            { $sort: { avgHours: -1 } }
        ]);

        // SLA Health Score (Percentage of tickets meeting SLA)
        const totalResolvedOrClosed = await Ticket.countDocuments({ status: { $in: ['Resolved', 'Closed'] } });
        const metSlaCount = await Ticket.countDocuments({ 
            status: { $in: ['Resolved', 'Closed'] }, 
            slaBreached: false 
        });
        const slaHealthScore = totalResolvedOrClosed > 0 
            ? ((metSlaCount / totalResolvedOrClosed) * 100).toFixed(1)
            : 100;

        // Average CSAT Rating
        const csatResult = await Ticket.aggregate([
            { $match: { 'feedback.rating': { $ne: null } } },
            { $group: { _id: null, avgRating: { $avg: '$feedback.rating' } } }
        ]);

        // Knowledge Base Trends (Top viewed articles)
        const kbTrendingArticles = await Article.find({ isPublished: true })
            .sort('-views')
            .limit(5)
            .select('title views category helpfulVotes');

        res.json({
            success: true,
            stats: {
                totalTickets,
                openTickets,
                inProgressTickets,
                resolvedTickets,
                closedTickets,
                criticalTickets,
                totalUsers,
                totalAgents,
                slaBreached,
                avgCsat: csatResult[0]?.avgRating?.toFixed(1) || 'N/A',
                slaHealthScore,
            },
            byCategory,
            bySubcategory,
            byPriority,
            byLevel,
            slaByCategory,
            slaByLevel,
            slaBreachedOverTime,
            ticketsOverTime,
            agentPerformance,
            avgResolutionTimeByCategory,
            avgResolutionTimeByPriority,
            kbTrendingArticles,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (admin)
const getUsers = async (req, res, next) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;
        const query = {};
        if (role) query.role = role;
        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
        ];

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({ success: true, users, total });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user role/status
// @route   PUT /api/admin/users/:id
// @access  Private (admin)
const updateUser = async (req, res, next) => {
    try {
        const { role, isActive, department, level, shift } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role, isActive, department, level, shift },
            { new: true, runValidators: true }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all agents (for assignment dropdown)
// @route   GET /api/admin/agents
// @access  Private (agents, managers, admins)
const getAgents = async (req, res, next) => {
    try {
        const agents = await User.find({ role: { $in: ['agent', 'manager'] }, isActive: true })
            .select('name email avatar role department');
        res.json({ success: true, agents });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all categories
// @route   GET /api/admin/categories
// @access  Private (admin, manager, agent)
const getCategories = async (req, res, next) => {
    try {
        const categories = await Category.find();
        res.json({ success: true, categories });
    } catch (error) {
        next(error);
    }
};

// @desc    Create/Update category
// @route   POST /api/admin/categories
// @access  Private (admin)
const upsertCategory = async (req, res, next) => {
    try {
        const { name, subcategories } = req.body;
        const category = await Category.findOneAndUpdate(
            { name },
            { name, subcategories },
            { upsert: true, new: true }
        );
        res.json({ success: true, category });
    } catch (error) {
        next(error);
    }
};

module.exports = { 
    getDashboard, 
    getUsers, 
    updateUser, 
    getAgents, 
    getCategories, 
    upsertCategory 
};
