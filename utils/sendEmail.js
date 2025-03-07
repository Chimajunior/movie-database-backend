const nodemailer = require('nodemailer');
require('dotenv').config();

//  Email Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

//  Function to Send Email
const sendEmail = async (to, subject, text) => {
    try {
        await transporter.sendMail({
            from: `"Movie Database" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
        });
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error(" Email Error:", error);
    }
};

module.exports = sendEmail;
