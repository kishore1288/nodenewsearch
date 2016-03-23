var config = require('config');
var mailConfig = config.get('Winston.Mail');
var winston = require('winston');

// Expose 'winston.transports.Mail in logger below
var Mail = require('winston-mail').Mail;
winston.emitErrs = true;

var logger = new winston.Logger( {
    transports: [
        new winston.transports.DailyRotateFile({
            name: 'log.info',
            level: 'info',
            filename: './logs/info.log',
            handleExceptions: false,
            json: true,
            maxsize: 5242880,
            maxFiles: 10,
            colorize: true,
            datePattern: 'yyyy-MM-dd'
        }),
        new winston.transports.DailyRotateFile({
            name: 'log.warn',
            level: 'warn',
            filename: './logs/warn.log',
            handleExceptions: false,
            json: true,
            maxsize: 5242880,
            maxFiles: 10,
            colorize: true,
            datePattern: 'yyyy-MM-dd'
        }),
        new winston.transports.DailyRotateFile({
            name: 'log.error',
            level: 'error',
            filename: './logs/error.log',
            handleExceptions: true,
            humanReadableUnhandledException: true,
            json: true,
            maxsize: 5242880,
            maxFiles: 10,
            colorize: true,
            datePattern: 'yyyy-MM-dd'
        }),
        new winston.transports.Console({
            level: 'debug',
            handleExceptions: true,
            json: false,
            colorize: true,
            humanReadableUnhandledException: true
        })
    ],
    exitOnError: false
});

module.exports = logger;
module.exports.stream = {
    write: function (message, encoding) {
        logger.info(message);
    }
};
