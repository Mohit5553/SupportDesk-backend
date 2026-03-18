const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    subcategories: [{
        name: {
            type: String,
            required: true
        },
        escalationTiming: {
            type: Number, // in minutes
            required: true
        }
    }],
}, {
    timestamps: true
});

module.exports = mongoose.model('Category', categorySchema);
