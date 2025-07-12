    var express = require('express');
    var router = express.Router();

    /* GET home page. */
    router.get('/', function(req, res, next) {
      // This route is typically for the root URL of the backend.
      // For an API-only backend, we return a simple JSON status.
      res.json({
        status: 'Backend is running',
        version: '1.0.0',
        message: 'Welcome to the Pluse-CRM Backend API!'
      });
    });

    module.exports = router;
    
