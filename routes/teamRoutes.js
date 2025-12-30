const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const upload = require('../middleware/uploadMiddleware'); // Import Multer

// Note: 'teamLogo' matches the name we will give the input in HTML

router.get('/', teamController.getAllTeams);
router.post('/', upload.single('teamLogo'), teamController.createTeam);
router.put('/:id', upload.single('teamLogo'), teamController.updateTeam);
router.delete('/:id', teamController.deleteTeam);

module.exports = router;