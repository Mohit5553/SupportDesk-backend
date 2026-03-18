const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
    {
        ticket: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Ticket',
            required: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        message: {
            type: String,
            required: [true, 'Comment message is required'],
            trim: true,
        },
        isInternal: {
            type: Boolean,
            default: false, // Internal notes visible only to agents/admins
        },
        attachments: [
            {
                filename: String,
                originalName: String,
                path: String,
                mimetype: String,
                size: Number,
            },
        ],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Comment', commentSchema);
