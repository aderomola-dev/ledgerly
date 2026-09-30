const express = require('express');
const { getUserAccounts } = require('../controllers/accountController');

const router = express.Router();

router.get('/', getUserAccounts);

module.exports = router;
