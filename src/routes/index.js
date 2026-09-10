const express = require('express'),
  router = express.Router(),
  telemetryService = require('../service/telemetry-service'),
  authmiddleware = require('../auth/auth.guard'),
  authmiddlewareV3 = require('../auth/auth.guard.v3');


router.post('/v1/telemetry', (req, res) => telemetryService.dispatch(req, res));

router.post('/v2/telemetry', (req, res, next) => authmiddleware.canActivate(req, res, next),(req, res) => telemetryService.dispatch(req, res));

router.post('/v3/telemetry', (req, res, next) => authmiddlewareV3.canActivate(req, res, next),(req, res) => telemetryService.dispatch(req, res));

router.get('/health', (req, res) => telemetryService.health(req, res));

router.get('/v1/getData', (req, res) => telemetryService.getData(req, res));

router.get('/v1/getCount', (req, res) => {
  console.log("query", req.query.event)
  telemetryService.getCount(req, res)
});

module.exports = router;
