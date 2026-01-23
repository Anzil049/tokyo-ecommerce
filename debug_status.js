const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("--- DEBUG START ---");
        const statuses = await Product.distinct('status');
        console.log("Distinct:", JSON.stringify(statuses));

        const missing = await Product.countDocuments({ status: { $exists: false } });
        console.log("Missing Status:", missing);

        const nullStat = await Product.countDocuments({ status: null });
        console.log("Null Status:", nullStat);

        const draftCount = await Product.countDocuments({ status: { $regex: /^draft$/i } });
        console.log("Regex Draft Count:", draftCount);

        const activeCount = await Product.countDocuments({ status: 'Active' });
        console.log("Active Count:", activeCount);

        const notDraftCount = await Product.countDocuments({ status: { $not: { $regex: /^draft$/i } } });
        console.log("Not Draft (Regex) Count:", notDraftCount);

        console.log("--- DEBUG END ---");
        process.exit();
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
