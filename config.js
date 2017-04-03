const winston = require('winston');

exports.batch_size =  1024*1024*1024*30; //30GB
exports.sqlite_path = process.env.HOME+"/autopass.sqlite";
exports.hpss_path = "autohpss"

exports.logger = {
    winston: {
        //hide headers which may contain jwt
        //requestWhitelist: ['url', /*'headers',*/ 'method', 'httpVersion', 'originalUrl', 'query'],
        transports: [
            //display all logs to console
            new winston.transports.Console({
                timestamp: function() {
                    var d = new Date();
                    return d.toString(); 
                },
                level: 'debug',
                colorize: true
            }),
        ]
    },
}

