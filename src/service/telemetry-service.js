const uuidv1 = require('uuid/v1'),
    request = require('request'),
    DispatcherClass = require('../dispatcher/dispatcher').Dispatcher;
config = require('../envVariables')


// TODO: Make this efficient. Implementation to be similar to typesafe config. Right now one configuration holds
// together all supported transport configurations

class TelemetryService {
    constructor(Dispatcher, config) {
        this.config = config;
        this.dispatcher = this.config.localStorageEnabled === 'true' ? new Dispatcher(config) : undefined;
    }
    dispatch(req, res) {
        const url = req.originalUrl;
        const version = url.split('/')[1];
        const message = req.body;
        // v2/v3 are auth-guarded: replace the session token with the permanent virtual id
        if(version === 'v2' || version === 'v3'){
            message.userId = req.user.virtual_id;
        }
        message.version = version;
        message.channel = req.get('x-channel-id');
        message.pid = req.get('x-app-id');
        if (!message.mid) message.mid = uuidv1();
        message.syncts = new Date().getTime();
        const data = JSON.stringify(message);
        console.log("message", message)
        if (this.config.localStorageEnabled === 'true' || this.config.telemetryProxyEnabled === 'true') {
            
            if (this.config.localStorageEnabled === 'true' && this.config.telemetryProxyEnabled !== 'true') {
                
                // Store locally and respond back with proper status code
                this.dispatcher.dispatch(message.mid, data, this.getRequestCallBack(req, res));
            } else if (this.config.localStorageEnabled === 'true' && this.config.telemetryProxyEnabled === 'true') {
                
                // Store locally and proxy to the specified URL. If the proxy fails ignore the error as the local storage is successful. Do a sync later
                const options = this.getProxyRequestObj(req, data);
                request.post(options, (err, data) => {
                    if (err) console.error('Proxy failed:', err);
                    else console.log('Proxy successful!  Server responded with:', data.body);
                });
                this.dispatcher.dispatch(message.mid, data, this.getRequestCallBack(req, res));
            } else if (this.config.localStorageEnabled !== 'true' && this.config.telemetryProxyEnabled === 'true') {
                
                // Just proxy
                const options = this.getProxyRequestObj(req, data);
                request.post(options, this.getRequestCallBack(req, res));
            }
        } else {
            this.sendError(res, { id: 'api.telemetry', params: { err: 'Configuration error' } });
        }
    }
    health(req, res) {
        const dbType = this.config.dispatcher || 'mongodb';

        const buildResponse = (mongoOk) => {
            const allOk = mongoOk !== false;
            return {
                status: allOk ? 'ok' : 'degraded',
                services: {
                    ...(mongoOk !== null && { mongodb: mongoOk }),
                },
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
            };
        };

        if (this.config.localStorageEnabled === 'true') {
            this.dispatcher.health((healthy) => {
                const mongoOk = dbType === 'mongodb' ? healthy : null;
                const body = buildResponse(mongoOk);
                res.status(body.status === 'ok' ? 200 : 503).json(body);
            });
        } else if (this.config.telemetryProxyEnabled === 'true') {
            res.status(200).json(buildResponse(null));
        } else {
            res.status(503).json(buildResponse(false));
        }
    }
    getRequestCallBack(req, res) {
        return (err, data) => {
            if (err) {
                console.log('error', err);
                this.sendError(res, { id: 'api.telemetry', params: { err: err } });
            }
            else {
                this.sendSuccess(res, { id: 'api.telemetry' });
            }
        }
    }
    sendError(res, options) {
        const resObj = {
            id: options.id,
            ver: options.ver || '1.0',
            ets: new Date().getTime(),
            params: options.params || {},
            responseCode: options.responseCode || 'SERVER_ERROR'
        }
        res.status(500);
        res.json(resObj);
    }
    sendSuccess(res, options) {
        const resObj = {
            id: options.id,
            ver: options.ver || '1.0',
            ets: new Date().getTime(),
            params: options.params || {},
            responseCode: options.responseCode || 'SUCCESS'
        }
        res.status(200);
        res.json(resObj);
    }
    getProxyRequestObj(req, data) {
        const headers = { 'authorization': 'Bearer ' + config.proxyAuthKey };
        if (req.get('content-type')) headers['content-type'] = req.get('content-type');
        if (req.get('content-encoding')) headers['content-encoding'] = req.get('content-encoding');
        return {
            url: this.config.proxyURL,
            headers: headers,
            body: data
        };
    }
    getData(req, res) {
        this.dispatcher.getData(req.body, (err, data) => {
            if (err) {
                console.log("error while fetching 112")

            } else if (data) {
                console.log("112")
                res.status(200).json({
                    statusCode: 3,
                    success: true,
                    message: 'Success',
                    result: data
                });
            } else {
                console.log("else 123")
                res.status(500).json({
                    statusCode: 3,
                    success: false,
                    message: 'Unable to fetch data',
                    result: err
                });
            }
        })
    }
    getCount(req, res) {
        this.dispatcher.getCount(req, (err, data) => {
            if (err) {
                console.log("error while fetching 137")

            } else if (data) {
                console.log("140")
                res.status(200).json({
                    statusCode: 3,
                    success: true,
                    message: 'Success',
                    result: data
                });
            } else {
                console.log("else 148")
                res.status(500).json({
                    statusCode: 3,
                    success: false,
                    message: 'Unable to fetch data',
                    result: err
                });
            }
        })
    }
}

module.exports = new TelemetryService(DispatcherClass, config);
