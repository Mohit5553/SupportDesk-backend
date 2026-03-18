require('dotenv').config();
const sendEmail = require('./utils/sendEmail');

const test = async () => {
    try {
        await sendEmail({
            email: process.env.EMAIL_USER,
            subject: 'Test Email From SupportDesk',
            message: 'If you are receiving this, the email configuration is fully working!'
        });
        console.log('✅ TEST EMAIL SENT SUCCESSFULLY!');
    } catch (error) {
        console.error('❌ TEST EMAIL FAILED:');
        console.error(error);
    }
};

test();
