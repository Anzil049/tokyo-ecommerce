const nodemailer = require('nodemailer');

// --- 1. SHARED TRANSPORTER (Reuse this connection) ---
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
    }
});

// --- 2. SEND OTP / GENERAL EMAIL (Your existing sendEmail) ---
const sendOTP = async (options) => {
    const mailOptions = {
        from: `Tokyo Sports <${process.env.EMAIL_USERNAME}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #4383FF;">Tokyo Sports</h2>
                <p>Hello,</p>
                <p style="font-size: 16px;">${options.message}</p>
                <p>This code expires in 10 minutes.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #888;">If you did not request this, please ignore this email.</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// --- 3. SEND CONTACT FORM TO ADMIN (Your existing sendContactEmail) ---
const sendContact = async (data) => {
    const adminEmailLayout = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4383FF;">New Contact Inquiry</h2>
            <p><strong>From:</strong> ${data.name}</p>
            <p><strong>Email:</strong> ${data.email}</p>
            <p><strong>Phone:</strong> ${data.phone || 'N/A'}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 16px; line-height: 1.6;">${data.message}</p>
        </div>
    `;

    const mailOptions = {
        from: `Tokyo Sports Contact <${process.env.EMAIL_USERNAME}>`,
        to: 'tokyosports049@gmail.com', 
        replyTo: data.email,
        subject: `Contact Form: Message from ${data.name}`,
        html: adminEmailLayout
    };

    await transporter.sendMail(mailOptions);
};

// --- 4. NEW: SEND ORDER STATUS UPDATE TO USER ---
const sendOrderStatus = async (email, name, orderId, itemName, status, rejectionReason = null) => {
    
    let subject = `Order Update: ${status}`;
    let heading = `Your Item is ${status}`;
    let messageBody = '';

    // Custom messages based on status
    switch (status) {
        case 'Shipped':
            subject = 'Your Order has been Shipped! 🚚';
            heading = 'On the way!';
            messageBody = `Good news! Your item <strong>${itemName}</strong> has been shipped.`;
            break;
        case 'Out for Delivery':
            subject = 'Out for Delivery Today! 📦';
            heading = 'Arriving Today';
            messageBody = `Get ready! Your item <strong>${itemName}</strong> is out for delivery. Please ensure someone is available to receive it.`;
            break;
        case 'Delivered':
            subject = 'Order Delivered successfully ✔️';
            heading = 'Delivered';
            messageBody = `Your item <strong>${itemName}</strong> has been delivered. Thank you for shopping with Tokyo Sports!`;
            break;
        case 'Cancelled':
            subject = 'Order Item Cancelled ❌';
            heading = 'Item Cancelled';
            messageBody = `Your item <strong>${itemName}</strong> has been cancelled. If you already paid, the refund has been credited to your Wallet.`;
            break;
        case 'Return Rejected':
            subject = 'Return Request Update ⚠️';
            heading = 'Return Rejected';
            messageBody = `We could not accept your return for <strong>${itemName}</strong>.<br><br><strong>Reason:</strong> ${rejectionReason || 'Policy Violation'}`;
            break;
        case 'Returned':
            subject = 'Return Approved & Refunded 💰';
            heading = 'Return Complete';
            messageBody = `Your return for <strong>${itemName}</strong> has been approved. The refund amount has been added to your Wallet.`;
            break;
        default:
            messageBody = `The status of <strong>${itemName}</strong> in Order #${orderId} has been updated to: <strong>${status}</strong>.`;
    }

    const mailOptions = {
        from: `Tokyo Sports <${process.env.EMAIL_USERNAME}>`,
        to: email,
        subject: subject,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #4383FF; padding: 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">TOKYO SPORTS</h1>
            </div>
            <div style="padding: 30px 20px; background-color: #ffffff;">
                <h2 style="color: #333; font-size: 20px; margin-top: 0;">${heading}</h2>
                <p style="color: #555; font-size: 16px;">Hello ${name},</p>
                <p style="color: #555; font-size: 16px;">${messageBody}</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px; color: #777;">Order ID: <strong>#${orderId}</strong></p>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                    <a href="http://localhost:3000/account.html" style="background-color: #4383FF; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px;">View Account</a>
                </div>
            </div>
            <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #888;">
                &copy; 2025 Tokyo Sports. All rights reserved.
            </div>
        </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// Export all functions
module.exports = { sendOTP, sendContact, sendOrderStatus };