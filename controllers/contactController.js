const { sendContact } = require('../utils/emailService');

exports.submitContactForm = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        // 1. Validation: Ensure required fields are present
        if (!name || !email || !message) {
            return res.status(400).json({ 
                success: false, 
                message: "Please fill in all required fields (Name, Email, Message)." 
            });
        }

        // 2. Send Email using the dedicated contact utility
        await sendContact({
            name,
            email,
            phone,
            message
        });

        // 3. Success Response
        res.status(200).json({ 
            success: true, 
            message: "Your message has been sent successfully!" 
        });

    } catch (error) {
        console.error("Contact Form Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to send message. Please try again later." 
        });
    }
};