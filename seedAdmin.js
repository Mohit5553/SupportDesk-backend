const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const adminExists = await User.findOne({ email: 'admin@support.com' });

        if (adminExists) {
            console.log('Admin already exists. Making sure role is explicitly set to admin.');
            adminExists.role = 'admin';

            // Force password rewrite to simple string so pre-save hook hashes it once
            adminExists.password = 'admin123';

            await adminExists.save();
            console.log('Admin account updated!');
        } else {
            await User.create({
                name: 'System Admin',
                email: 'admin@support.com',
                password: 'admin123',
                role: 'admin',
            });
            console.log('Admin account created successfully!');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
};

createAdmin();
