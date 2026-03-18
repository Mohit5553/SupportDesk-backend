const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');

const professionalCategories = [
    {
        name: "Hardware & Devices",
        subcategories: [
            { name: "Laptop/Desktop Repair", escalationTiming: 120 },
            { name: "Printer/Scanner Issues", escalationTiming: 180 },
            { name: "Mobile Device Support", escalationTiming: 60 },
            { name: "Peripheral Replacement", escalationTiming: 240 }
        ]
    },
    {
        name: "Software & Applications",
        subcategories: [
            { name: "OS Installation/Update", escalationTiming: 120 },
            { name: "Business Software Support", escalationTiming: 90 },
            { name: "Application Performance", escalationTiming: 60 },
            { name: "Software Licensing", escalationTiming: 480 }
        ]
    },
    {
        name: "Network & Connectivity",
        subcategories: [
            { name: "Wi-Fi & Internet Access", escalationTiming: 30 },
            { name: "VPN Connectivity", escalationTiming: 45 },
            { name: "Local Network (LAN)", escalationTiming: 60 },
            { name: "Firewall/Security Access", escalationTiming: 120 }
        ]
    },
    {
        name: "Accounts & Authentication",
        subcategories: [
            { name: "Password Reset", escalationTiming: 15 },
            { name: "New Account Creation", escalationTiming: 120 },
            { name: "Multi-Factor Auth (MFA)", escalationTiming: 30 },
            { name: "Access Permissions", escalationTiming: 90 }
        ]
    },
    {
        name: "Email & Communication",
        subcategories: [
            { name: "Outlook/Mail Client Issues", escalationTiming: 60 },
            { name: "Distribution List Access", escalationTiming: 120 },
            { name: "Spam & Security Filters", escalationTiming: 45 },
            { name: "Video Conferencing Tools", escalationTiming: 30 }
        ]
    },
    {
        name: "Security & Compliance",
        subcategories: [
            { name: "Virus/Malware Infection", escalationTiming: 30 },
            { name: "Lost/Stolen Device", escalationTiming: 15 },
            { name: "Security Badge/ID Access", escalationTiming: 60 },
            { name: "Compliance Documentation", escalationTiming: 480 }
        ]
    },
    {
        name: "ERP & Database",
        subcategories: [
            { name: "ERP System Error", escalationTiming: 60 },
            { name: "Database Query Support", escalationTiming: 120 },
            { name: "Data Export Request", escalationTiming: 240 },
            { name: "System Integration Issue", escalationTiming: 180 }
        ]
    },
    {
        name: "Cloud Services",
        subcategories: [
            { name: "Azure/AWS Instance Support", escalationTiming: 45 },
            { name: "Cloud Storage Access", escalationTiming: 60 },
            { name: "SaaS Application Login", escalationTiming: 30 },
            { name: { name: "Billing & Subscription", escalationTiming: 720 } }
        ].map(s => typeof s.name === 'string' ? s : { name: "Cloud Backup/Sync", escalationTiming: 90 }) // Fixing structure
    },
    {
        name: "POS & Retail Systems",
        subcategories: [
            { name: "POS Hardware Failure", escalationTiming: 20 },
            { name: "Transaction Processing", escalationTiming: 15 },
            { name: "Inventory Sync Issue", escalationTiming: 45 },
            { name: "Billing Software Error", escalationTiming: 30 }
        ]
    },
    {
        name: "Training & Knowledge",
        subcategories: [
            { name: "System Usage Guidance", escalationTiming: 480 },
            { name: "New Employee Onboarding", escalationTiming: 1440 },
            { name: "Knowledge Base Access", escalationTiming: 240 },
            { name: "Process Documentation", escalationTiming: 720 }
        ]
    }
];

// Re-map to fix my manual typo in subcategories above
professionalCategories[7].subcategories = [
    { name: "Azure/AWS Instance Support", escalationTiming: 45 },
    { name: "Cloud Storage Access", escalationTiming: 60 },
    { name: "SaaS Application Login", escalationTiming: 30 },
    { name: "Cloud Backup/Sync", escalationTiming: 90 }
];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB...");

        // Remove existing categories to start fresh with high-quality data
        await Category.deleteMany({});
        console.log("Cleared existing categories.");

        await Category.insertMany(professionalCategories);
        console.log("✅ Successfully seeded 10 professional categories and 40 subcategories!");

        process.exit();
    } catch (err) {
        console.error("❌ Error seeding database:", err);
        process.exit(1);
    }
};

seedDB();
