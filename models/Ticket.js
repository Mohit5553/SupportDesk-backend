const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
    {
        ticketId: {
            type: String,
            unique: true,
        },
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        description: {
            type: String,
            required: [true, 'Description is required'],
            trim: true,
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
        },
        subcategory: {
            type: String,
            default: '',
        },
        currentLevel: {
            type: Number,
            default: 1,
            min: 1,
            max: 3
        },
        priority: {
            type: String,
            required: [true, 'Priority is required'],
            enum: ['Low', 'Medium', 'High', 'Critical'],
            default: 'Low',
        },
        status: {
            type: String,
            enum: ['Open', 'Assigned', 'In Progress', 'Pending', 'Resolved', 'Closed'],
            default: 'Open',
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        attachments: [
            {
                filename: String,
                originalName: String,
                path: String,
                mimetype: String,
                size: Number,
                uploadedAt: { type: Date, default: Date.now },
            },
        ],
        resolutionNote: {
            type: String,
            default: '',
        },
        slaDeadline: {
            type: Date,
        },
        slaBreached: {
            type: Boolean,
            default: false,
        },
        firstResponseAt: {
            type: Date,
        },
        resolvedAt: {
            type: Date,
        },
        closedAt: {
            type: Date,
        },
        feedback: {
            rating: { type: Number, min: 1, max: 5 },
            comment: String,
            submittedAt: Date,
        },
        tags: [String],
        events: [
            {
                type: { type: String }, // STATUS_CHANGE, ASSIGNED, ESCALATED, COMMENT, FEEDBACK
                message: { type: String },
                performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                meta: { type: mongoose.Schema.Types.Mixed },
                createdAt: { type: Date, default: Date.now },
            }
        ],
    },
    {
        timestamps: true,
    }
);

// Auto-generate ticket ID before saving
ticketSchema.pre('save', async function () {
    if (!this.ticketId) {
        const count = await mongoose.model('Ticket').countDocuments();
        this.ticketId = `TKT-${String(count + 1).padStart(5, '0')}`;
    }

    // Set SLA deadline based on priority
    // Set SLA deadline based on category/subcategory escalation timing or priority
    if (this.isNew) {
        let timing = 24 * 60 * 60 * 1000; // Default: 24 hours (Low)

        const category = await mongoose.model('Category').findOne({ name: this.category });
        if (category) {
            const subcat = category.subcategories.find(s => s.name === this.subcategory);
            if (subcat) {
                timing = subcat.escalationTiming * 60 * 1000; // minutes to ms
            }
        } else {
            // Fallback to priority map if category not found or handled differently
            const slaMap = {
                Critical: 15 * 60 * 1000,        // 15 minutes
                High: 60 * 60 * 1000,             // 1 hour
                Medium: 4 * 60 * 60 * 1000,       // 4 hours
                Low: 24 * 60 * 60 * 1000,         // 24 hours
            };
            timing = slaMap[this.priority] || timing;
        }

        this.slaDeadline = new Date(Date.now() + timing);
    }
});

module.exports = mongoose.model('Ticket', ticketSchema);
