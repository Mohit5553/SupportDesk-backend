const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Category = require('../models/Category');
const path = require('path');
const sendEmail = require('../utils/sendEmail');

const { getCurrentShift } = require('../utils/escalationLogic');
const { sendNotification, broadcastToAdmins } = require('../utils/socket');

// Helper: Auto-assign ticket (Round-Robin)
const autoAssignTicket = async (ticket) => {
    const shifts = getCurrentShift();
    // Initially assign to Level 1 agents in the current shift
    const agents = await User.find({ 
        role: 'agent', 
        isActive: true,
        level: 'Level 1',
        shift: { $in: shifts }
    }).sort('lastLogin');

    if (agents.length > 0) {
        const nextAgent = agents[0]; 
        ticket.assignedTo = nextAgent._id;
        ticket.status = 'Assigned';
        ticket.currentLevel = 1;
        return nextAgent;
    }
    return null;
};

// @desc    Create ticket
// @route   POST /api/tickets
// @access  Private (customers, agents, admins)
const createTicket = async (req, res, next) => {
    try {
        const { title, description, category, subcategory, priority, tags } = req.body;

        const attachments = req.files
            ? req.files.map((f) => ({
                filename: f.filename,
                originalName: f.originalname,
                path: f.path,
                mimetype: f.mimetype,
                size: f.size,
            }))
            : [];

        const ticket = await Ticket.create({
            title,
            description,
            category,
            subcategory,
            priority,
            tags: tags ? JSON.parse(tags) : [],
            createdBy: req.user._id,
            attachments,
        });

        // Automatic assignment
        const assignedAgent = await autoAssignTicket(ticket);

        // Add creation event
        ticket.events = [{
            type: 'CREATED',
            message: `Ticket created by ${req.user.name}`,
            performedBy: req.user._id,
        }];
        if (assignedAgent) {
            ticket.events.push({
                type: 'ASSIGNED',
                message: `Auto-assigned to ${assignedAgent.name} (Level 1)`,
                performedBy: req.user._id,
                meta: { agentId: assignedAgent._id, agentName: assignedAgent.name },
            });
        }
        await ticket.save();

        await ticket.populate('createdBy', 'name email avatar role');
        if (assignedAgent) {
            await ticket.populate('assignedTo', 'name email avatar role');

            // Notify Agent
            try {
                await sendEmail({
                    email: assignedAgent.email,
                    subject: `New Ticket Assigned: ${ticket.ticketId}`,
                    message: `Ticket "${ticket.title}" has been automatically assigned to you.`,
                });
            } catch (err) { console.error('Email failed'); }
        }

        // Notify Requester
        try {
            await sendEmail({
                email: req.user.email,
                subject: `Ticket Created: ${ticket.ticketId}`,
                message: `Your ticket "${ticket.title}" has been created successfully.`,
            });
        } catch (err) { console.error('Email failed'); }

        res.status(201).json({ success: true, ticket });

        // Real-time notifications
        broadcastToAdmins({
            type: 'NEW_TICKET',
            message: `New ticket created: ${ticket.ticketId}`,
            ticketId: ticket._id
        });

        if (assignedAgent) {
            sendNotification(assignedAgent._id.toString(), {
                type: 'TICKET_ASSIGNED',
                message: `You have been assigned to ticket: ${ticket.ticketId}`,
                ticketId: ticket._id
            });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get all tickets (with filters, pagination)
// @route   GET /api/tickets
// @access  Private
const getTickets = async (req, res, next) => {
    try {
        const { status, priority, category, tags, search, page = 1, limit = 10, sort = '-createdAt' } = req.query;

        const query = {};

        // Customers see only their own tickets
        if (req.user.role === 'customer') {
            query.createdBy = req.user._id;
        }
        // Agents see assigned tickets + open ones
        if (req.user.role === 'agent') {
            query.$or = [{ assignedTo: req.user._id }, { status: 'Open' }];
        }

        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;
        if (tags) {
            query.tags = { $in: tags.split(',') };
        }
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { ticketId: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await Ticket.countDocuments(query);
        const tickets = await Ticket.find(query)
            .populate('createdBy', 'name email avatar')
            .populate('assignedTo', 'name email avatar')
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            tickets,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                limit: parseInt(limit),
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Private
const getTicket = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate('createdBy', 'name email avatar role')
            .populate('assignedTo', 'name email avatar role');

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        // Customers can only view their own tickets
        if (req.user.role === 'customer' && ticket.createdBy._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const comments = await Comment.find({ ticket: ticket._id })
            .populate('author', 'name email avatar role')
            .sort('createdAt');

        // Customers cannot see internal notes
        const filteredComments =
            req.user.role === 'customer' ? comments.filter((c) => !c.isInternal) : comments;

        res.json({ success: true, ticket, comments: filteredComments });
    } catch (error) {
        next(error);
    }
};

// @desc    Update ticket status
// @route   PUT /api/tickets/:id/status
// @access  Private (agents, managers, admins)
const updateTicketStatus = async (req, res, next) => {
    try {
        const { status, resolutionNote } = req.body;
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        ticket.status = status;

        if (status === 'In Progress' && !ticket.firstResponseAt) {
            ticket.firstResponseAt = new Date();
        }
        if (status === 'Resolved') {
            ticket.resolvedAt = new Date();
            if (resolutionNote) ticket.resolutionNote = resolutionNote;
        }
        if (status === 'Closed') {
            ticket.closedAt = new Date();
        }

        await ticket.save();

        // Log audit event
        ticket.events.push({
            type: 'STATUS_CHANGE',
            message: `Status changed to ${status}${resolutionNote ? ` — ${resolutionNote}` : ''}`,
            performedBy: req.user._id,
            meta: { from: ticket.status, to: status },
        });
        await Ticket.findByIdAndUpdate(req.params.id, {
            $push: { events: {
                type: 'STATUS_CHANGE',
                message: `Status changed to "${status}"${resolutionNote ? ` — ${resolutionNote}` : ''}`,
                performedBy: req.user._id,
                meta: { status },
                createdAt: new Date(),
            }}
        });

        await ticket.populate('createdBy assignedTo', 'name email avatar role');

        // Email Notification for Resolution or Closure
        if (status === 'Resolved' || status === 'Closed') {
            try {
                await sendEmail({
                    email: ticket.createdBy.email,
                    subject: `Ticket ${status}: ${ticket.ticketId}`,
                    message: `Your ticket "${ticket.title}" has been marked as ${status}.\n\nResolution Notes: ${resolutionNote || 'N/A'}`
                });
            } catch (err) { console.error('Email failed'); }
        }

        res.json({ success: true, ticket });

        // Real-time notifications
        sendNotification(ticket.createdBy._id.toString(), {
            type: 'STATUS_UPDATE',
            message: `Your ticket ${ticket.ticketId} is now ${status}`,
            ticketId: ticket._id,
            status: status
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Assign ticket to agent
// @route   PUT /api/tickets/:id/assign
// @access  Private (managers, admins)
const assignTicket = async (req, res, next) => {
    try {
        const { agentId } = req.body;

        const agent = await User.findById(agentId);
        if (!agent || !['agent', 'manager'].includes(agent.role)) {
            return res.status(400).json({ success: false, message: 'Invalid agent' });
        }

        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            { assignedTo: agentId, status: 'Assigned' },
            { new: true }
        )
            .populate('createdBy', 'name email avatar')
            .populate('assignedTo', 'name email avatar');

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        // Log audit event
        await Ticket.findByIdAndUpdate(req.params.id, {
            $push: { events: {
                type: 'ASSIGNED',
                message: `Assigned to ${agent.name}`,
                performedBy: req.user._id,
                meta: { agentName: agent.name },
                createdAt: new Date(),
            }}
        });

        res.json({ success: true, ticket });

        // Real-time notifications
        sendNotification(agentId, {
            type: 'TICKET_ASSIGNED',
            message: `You have been assigned to ticket: ${ticket.ticketId}`,
            ticketId: ticket._id
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Add comment to ticket
// @route   POST /api/tickets/:id/comments
// @access  Private
const addComment = async (req, res, next) => {
    try {
        const { message, isInternal } = req.body;
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        // Customers cannot add internal notes
        const internal = req.user.role === 'customer' ? false : isInternal === 'true' || isInternal === true;

        const attachments = req.files
            ? req.files.map((f) => ({
                filename: f.filename,
                originalName: f.originalname,
                path: f.path,
                mimetype: f.mimetype,
                size: f.size,
            }))
            : [];

        const comment = await Comment.create({
            ticket: ticket._id,
            author: req.user._id,
            message,
            isInternal: internal,
            attachments,
        });

        await comment.populate('author', 'name email avatar role');

        // Update ticket status if agent replies
        if (['agent', 'manager', 'admin'].includes(req.user.role) && ticket.status === 'Open') {
            ticket.status = 'In Progress';
            if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
            await ticket.save();
        }

        // Email Notification for new comment
        try {
            await ticket.populate('createdBy assignedTo', 'email name');
            if (req.user.role === 'customer' && ticket.assignedTo) {
                // Notify Agent
                await sendEmail({
                    email: ticket.assignedTo.email,
                    subject: `New Comment on ${ticket.ticketId}`,
                    message: `Customer ${req.user.name} added a new comment to ticket "${ticket.title}".`
                });
            } else if (['agent', 'manager', 'admin'].includes(req.user.role) && !internal) {
                // Notify Customer
                await sendEmail({
                    email: ticket.createdBy.email,
                    subject: `New Reply on ${ticket.ticketId}`,
                    message: `Support Agent ${req.user.name} replied to your ticket "${ticket.title}".\n\nReply: ${message}`
                });
            }
        } catch (err) { console.error('Email failed'); }

        res.status(201).json({ success: true, comment });

        // Real-time notifications
        if (req.user.role === 'customer') {
            if (ticket.assignedTo) {
                sendNotification(ticket.assignedTo._id.toString(), {
                    type: 'NEW_COMMENT',
                    message: `Customer replied to ticket ${ticket.ticketId}`,
                    ticketId: ticket._id
                });
            }
        } else {
            // Agent/Admin replied
            if (!internal) {
                sendNotification(ticket.createdBy._id.toString(), {
                    type: 'NEW_COMMENT',
                    message: `Agent replied to your ticket ${ticket.ticketId}`,
                    ticketId: ticket._id
                });
            }
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Submit feedback
// @route   POST /api/tickets/:id/feedback
// @access  Private (ticket owner only)
const submitFeedback = async (req, res, next) => {
    try {
        const { rating, comment } = req.body;
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        if (ticket.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (!['Resolved', 'Closed'].includes(ticket.status)) {
            return res.status(400).json({ success: false, message: 'Can only rate resolved or closed tickets' });
        }

        ticket.feedback = { rating, comment, submittedAt: new Date() };
        ticket.status = 'Closed';
        ticket.closedAt = new Date();
        await ticket.save();

        res.json({ success: true, message: 'Feedback submitted', ticket });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete ticket (admin only)
// @route   DELETE /api/tickets/:id
// @access  Private (admin)
const deleteTicket = async (req, res, next) => {
    try {
        const ticket = await Ticket.findByIdAndDelete(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        await Comment.deleteMany({ ticket: req.params.id });
        res.json({ success: true, message: 'Ticket deleted' });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all categories
// @route   GET /api/tickets/categories
// @access  Private
const getCategories = async (req, res, next) => {
    try {
        const categories = await Category.find();
        res.json({ success: true, categories });
    } catch (error) {
        next(error);
    }
};

const bulkAction = async (req, res, next) => {
    try {
        const { ticketIds, action, value } = req.body;
        if (!ticketIds || !ticketIds.length) {
            return res.status(400).json({ success: false, message: 'No tickets selected' });
        }

        let update = {};
        let eventMsg = '';

        if (action === 'status') {
            update.status = value;
            if (value === 'Resolved') update.resolvedAt = new Date();
            if (value === 'Closed') update.closedAt = new Date();
            eventMsg = `Bulk status change to "${value}" by ${req.user.name}`;
        } else if (action === 'priority') {
            update.priority = value;
            eventMsg = `Bulk priority change to "${value}" by ${req.user.name}`;
        } else if (action === 'assign') {
            update.assignedTo = value;
            update.status = 'Assigned';
            eventMsg = `Bulk assigned by ${req.user.name}`;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        await Ticket.updateMany(
            { _id: { $in: ticketIds } },
            {
                $set: update,
                $push: { events: { type: 'BULK_ACTION', message: eventMsg, performedBy: req.user._id, createdAt: new Date() } }
            }
        );

        res.json({ success: true, message: `Updated ${ticketIds.length} tickets` });
    } catch (error) {
        next(error);
    }
};

module.exports = {
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
};
