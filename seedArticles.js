const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('./config/db');
const Article = require('./models/Article');
const User = require('./models/User');

const articles = [
    {
        title: "Getting Started with the Support Portal",
        slug: "getting-started",
        content: `
# Welcome to SupportDesk

This guide will walk you through the basics of our support portal.

### 1. Creating a Ticket
Navigate to the "New Ticket" section in the sidebar. Fill in the title, detailed description, and choose the correct category and priority level.

### 2. Following Up
You can view all your active tickets under the "Tickets" menu. Here you'll see real-time updates from our support agents.

### 3. Attachments
If you have screenshots or logs, you can attach up to 3 files per message. This helps our agents resolve your issues faster.
        `,
        category: "General",
        tags: ["guide", "new-user"]
    },
    {
        title: "How to Reset Your Enterprise Password",
        slug: "reset-password",
        content: `
# Password Reset Protocol

Security is our priority. If you've forgotten your password, follow these steps:

1. Click on "Forgot Password" on the login screen.
2. Enter your registered corporate email.
3. You will receive a secure link valid for 30 minutes.
4. Set a new password that meets our complexity requirements (at least 1 uppercase, 1 number, and 1 special character).

*Note: If you are locked out after 5 failed attempts, please contact your IT manager directly.*
        `,
        category: "Security",
        tags: ["it", "security", "credentials"]
    },
    {
        title: "Common VPN Connection Issues",
        slug: "vpn-troubleshoot",
        content: `
# VPN Troubleshooting Guide

Having trouble connecting to the corporate network? Try these fixes:

### 1. Check Internet Connection
Ensure your home Wi-Fi is stable before attempting the VPN handshake.

### 2. Client Refresh
Sometimes the VPN client needs a fresh start. Close the application entirely and re-open it as Administrator.

### 3. Server Selection
If 'Auto-Select' is failing, manually choose the server closest to your physical location from the dropdown list.

### 4. MFA Authentication
Ensure your authenticator app is showing a fresh code. If codes are out of sync, click on 'Refresh' in your mobile app.
        `,
        category: "Network",
        tags: ["vpn", "network", "remote"]
    }
];

const seedArticles = async () => {
    try {
        await connectDB();
        
        // Find an admin or manager to be the author
        const author = await User.findOne({ role: { $in: ['admin', 'manager'] } });
        if (!author) {
            console.error('No admin/manager found to assign articles to. Please create one first.');
            process.exit(1);
        }

        await Article.deleteMany({});
        
        const seeded = articles.map(a => ({
            ...a,
            author: author._id,
            isPublished: true
        }));

        await Article.insertMany(seeded);
        console.log('✅ Knowledge Base articles seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding articles:', error);
        process.exit(1);
    }
};

seedArticles();
