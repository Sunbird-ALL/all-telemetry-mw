const winston = require('winston');
require('winston-daily-rotate-file');
require('./kafka-dispatcher');
require('./cassandra-dispatcher');
require('./clickhouse-dispatcher');
require('./mysql-dispatcher');
require('./mongodb-dispatcher');


const getData = require('./clickhouse-dispatcher');
const getCount = require('./clickhouse-dispatcher');

const defaultFileOptions = {
    filename: 'dispatcher-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '100m',
    maxFiles: '100',
    zippedArchive: true,
    json: true
}

class Dispatcher {
    constructor(options) {
        if (!options) throw new Error('Dispatcher options are required');
        this.logger = new (winston.Logger)({ level: 'info' });
        this.options = options;
        if (this.options.dispatcher == 'kafka') {
            console.log("inside kafka")
            this.logger.add(winston.transports.Kafka, this.options);
            console.log('Kafka transport enabled !!!');
        } else if (this.options.dispatcher == 'file') {
            console.log("inside file")
            const config = Object.assign(defaultFileOptions, this.options);
            this.logger.add(winston.transports.DailyRotateFile, config);
            console.log('File transport enabled !!!');
        } else if (this.options.dispatcher === 'cassandra') {
            console.log("inside cassandra")
            this.logger.add(winston.transports.Cassandra, this.options);
            console.log('Cassandra transport enabled !!!');
        } else if (this.options.dispatcher === 'clickhouse') {
            console.log("inside clickhouse")
            this.logger.add(winston.transports.clickhouse, this.options);
            console.log('clickhouse transport enabled !!!');
        } else if (this.options.dispatcher === 'mysql') {
            console.log("inside mysql")
            this.logger.add(winston.transports.mysql, this.options);
            console.log('mysql transport enabled !!!');
        }else if (this.options.dispatcher === 'mongodb') {
          console.log("inside mongodb");
          this.logger.add(winston.transports.mongodb, this.options);
          console.log('mongodb transport enabled !!!');
        }else { // Log to console
            console.log("inside else")
            this.options.dispatcher = 'console'
            const config = Object.assign({ json: true, stringify: (obj) => JSON.stringify(obj) }, this.options);
            this.logger.add(winston.transports.Console, config);
            console.log('Console transport enabled !!!');
        }
    }

    dispatch(mid, message, callback) {
        this.logger.log('info', message, { mid: mid }, callback);
    }

    health(callback) {
        if (this.options.dispatcher === 'kafka') {
            this.logger.transports['kafka'].health(callback);
        } else if (this.options.dispatcher === 'console') {
            callback(true)
        } else { // need to add health method for file/cassandra
            callback(false)
        }
    }

    getData(payload, callback) {
        getData.clickhouse(payload, (err, res) => {
            if (err) {
                console.log("66")
                callback(null, null);
            } else if (res) {
                console.log("69")
                callback(null, res);
            } else {
                console.log("72")
                callback(null, null);
            }
        })
    }

    getCount(payload, callback) {
        getCount.clickhouseQuery(payload, (err, res) => {
            if (err) {
                console.log("81")
                callback(null, null);
            } else if (res) {
                console.log("83")
                callback(null, res);
            } else {
                console.log("87")
                callback(null, null);
            }
        })
    }
}

module.exports = { Dispatcher };
