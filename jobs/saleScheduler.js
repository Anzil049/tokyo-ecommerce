const cron = require('node-cron');
const Sale = require('../models/Sale');
const saleController = require('../controllers/saleController');

const startScheduler = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        // console.log(`[Scheduler] Checking sales at ${now.toLocaleTimeString()}...`);

        try {
            // --- JOB 1: START SALES ---
            // Find sales that:
            // 1. Are Active (User wants them)
            // 2. Start Date has passed (Should be running)
            // 3. Are NOT yet applied (Math hasn't run)
            const salesToStart = await Sale.find({
                isActive: true,
                isApplied: false,
                startDate: { $lte: now },
                endDate: { $gte: now } 
            });

            for (const sale of salesToStart) {
                console.log(`[Scheduler] Starting Sale: ${sale.name}`);
                await saleController.applyDiscountToProducts(sale);
            }

            // --- JOB 2: END SALES ---
            // Find sales that:
            // 1. Are marked as Applied
            // 2. End Date has passed OR isActive was manually set to false (though updateSale handles manual)
            const salesToEnd = await Sale.find({
                isApplied: true,
                $or: [
                    { endDate: { $lt: now } }, // Time expired
                    { isActive: false }        // Manually turned off (safety check)
                ]
            });

            for (const sale of salesToEnd) {
                console.log(`[Scheduler] Ending Sale: ${sale.name}`);
                await saleController.revertSalePrices(sale);
                
                // Ensure isActive is false
                sale.isActive = false;
                await sale.save();
            }

        } catch (err) {
            console.error("[Scheduler] Error:", err);
        }
    });

    console.log("✅ Sale Scheduler Initialized (Runs every minute)");
};

module.exports = startScheduler;