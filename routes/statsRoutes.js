const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/public', statsController.getPublicStats);

module.exports = router;