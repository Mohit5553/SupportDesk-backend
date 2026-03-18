const Ticket = require('../models/Ticket');
const User = require('../models/User');

// Helper to filter dates
const getDateFilter = (startDate, endDate) => {
    const filter = {};
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }
    return filter;
}

exports.getReportData = async (req, res, next) => {
    try {
        const { type, startDate, endDate } = req.query;
        const dateFilter = getDateFilter(startDate, endDate);

        let data = [];

        if (type === 'csat') {
            const tickets = await Ticket.find({
                ...dateFilter,
                status: { $in: ['Resolved', 'Closed'] },
                'feedback.rating': { $exists: true }
            }).populate('assignedTo', 'name').populate('createdBy', 'name email');

            data = tickets.map(t => ({
                ticketId: t.ticketId,
                title: t.title,
                agent: t.assignedTo?.name || 'Unassigned',
                customer: t.createdBy?.name || 'Unknown',
                rating: t.feedback.rating,
                comment: t.feedback.comment || '',
                date: t.feedback.submittedAt || t.updatedAt
            }));

        } else if (type === 'agents') {
            // Aggregate agent performance
            const matchQuery = { ...dateFilter, assignedTo: { $exists: true } };
            const agentStats = await Ticket.aggregate([
                { $match: matchQuery },
                { $group: {
                    _id: '$assignedTo',
                    totalHandled: { $sum: 1 },
                    resolved: { $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] } },
                    totalRating: { $sum: '$feedback.rating' },
                    ratedCount: { $sum: { $cond: ['$feedback.rating', 1, 0] } }
                }}
            ]);

            const populatedStats = await User.populate(agentStats, { path: '_id', select: 'name email department' });
            
            data = populatedStats.map(s => ({
                agentName: s._id?.name || 'Unknown',
                email: s._id?.email || '',
                department: s._id?.department || 'N/A',
                totalHandled: s.totalHandled,
                resolved: s.resolved,
                resolutionRate: s.totalHandled ? `${Math.round((s.resolved / s.totalHandled) * 100)}%` : '0%',
                avgCsat: s.ratedCount ? (s.totalRating / s.ratedCount).toFixed(1) : 'N/A'
            }));

        } else if (type === 'tickets') {
            const tickets = await Ticket.find(dateFilter)
                .populate('assignedTo', 'name')
                .populate('category');

            data = tickets.map(t => ({
                ticketId: t.ticketId,
                title: t.title,
                status: t.status,
                priority: t.priority,
                category: t.category,
                slaBreached: t.slaBreached ? 'Yes' : 'No',
                assignedTo: t.assignedTo?.name || 'Unassigned',
                createdAt: t.createdAt
            }));
        } else {
            return res.status(400).json({ success: false, message: 'Invalid report type' });
        }

        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        next(error);
    }
};
