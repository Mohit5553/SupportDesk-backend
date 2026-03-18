const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('./models/Category');
const User = require('./models/User');

dotenv.config();

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Seed Categories
        await Category.deleteMany();
        const itSupport = await Category.create({
            name: 'IT Support',
            subcategories: [
                { name: 'Hardware Support', escalationTiming: 30 },
                { name: 'Server Support', escalationTiming: 15 },
                { name: 'POS Billing Support', escalationTiming: 5 }
            ]
        });
        console.log('Categories seeded');

        // Update existing users or create new ones for levels
        // Note: This assumes you have users with these names or will create them.
        // For demonstration, I'll update by name if exists, or just log.
        
        const agents = [
            { name: 'Intekhab', level: 'Level 1', shift: 'Day', email: 'intekhab@example.com' },
            { name: 'Mohit', level: 'Level 2', shift: 'Day', email: 'mohit@example.com' },
            { name: 'Zia', level: 'Level 3', shift: 'Day', email: 'zia@example.com' }
        ];

        for (const agentData of agents) {
            await User.findOneAndUpdate(
                { name: agentData.name },
                { 
                    role: 'agent', 
                    level: agentData.level, 
                    shift: agentData.shift,
                    email: agentData.email,
                    password: 'password123' // default password if creating new
                },
                { upsert: true, new: true }
            );
        }
        console.log('Agents seeded/updated');

        process.exit();
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData();
