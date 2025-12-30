const Team = require('../models/Team');
const Product = require('../models/Product'); 
// 1. Get All Teams
exports.getAllTeams = async (req, res) => {
    try {
        const teams = await Team.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: teams });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// 2. Create Team
exports.createTeam = async (req, res) => {
    try {
        const { name, type, status } = req.body;
        
        // Handle Image Path
        let logoPath = "";
        if (req.file) {
            // Save path relative to public folder (e.g., /uploads/teams/img.jpg)
            logoPath = `/uploads/teams/${req.file.filename}`;
        }

        const newTeam = new Team({
            name,
            type,
            status: status || 'Active',
            logo: logoPath 
        });

        await newTeam.save();
        res.status(201).json({ success: true, message: "Team created!" });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// 3. Update Team
// 3. Update Team
exports.updateTeam = async (req, res) => {
    try {
        const { name, type, status } = req.body;
        const teamId = req.params.id;

        // 1. Find the existing team first to get the OLD name
        const oldTeam = await Team.findById(teamId);
        if (!oldTeam) {
            return res.status(404).json({ success: false, error: "Team not found" });
        }

        const oldName = oldTeam.name;

        // 2. Prepare Update Data
        let updateData = { name, type, status };

        // Only update logo if a new file was uploaded
        if (req.file) {
            updateData.logo = `/uploads/teams/${req.file.filename}`;
        }

        // 3. Update the Team
        const updatedTeam = await Team.findByIdAndUpdate(teamId, updateData, { new: true });

        // 4. *** SYNC LOGIC ***
        // If the name changed, update all products that belonged to this team
        if (name && oldName !== name) {
            await Product.updateMany(
                { team: oldName },        // Find products with OLD team name
                { $set: { team: name } }  // Update to NEW team name
            );
        }

        res.json({ success: true, data: updatedTeam });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// 4. Delete Team
exports.deleteTeam = async (req, res) => {
    try {
        const teamId = req.params.id;

        // 1. Find the team first to get its name
        const teamToDelete = await Team.findById(teamId);
        if (!teamToDelete) {
            return res.status(404).json({ success: false, error: "Team not found" });
        }

        const teamName = teamToDelete.name;

        // 2. Delete the Team
        await Team.findByIdAndDelete(teamId);

        // 3. *** SYNC LOGIC ***
        // Find all products in this team, set them to Draft, and remove the team name
        await Product.updateMany(
            { team: teamName },
            { 
                $set: { 
                    status: 'Draft', 
                    team: '' // Remove the deleted team name
                } 
            }
        );

        res.json({ success: true, message: "Team deleted and associated products moved to Drafts." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};