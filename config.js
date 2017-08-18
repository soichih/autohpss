const winston = require('winston');

exports.batch_size =  1024*1024*1024*30; //30GB
exports.hpss_path = "autohpss"

//use ~/../Karst/.config so that the same DB will be used across different systems
//TODO - should I just create ~/../.config/?
exports.sqlite_path = process.env.HOME+"/../Karst/.config/autopass/files.sqlite";

exports.logger = {
    winston: {
        //hide headers which may contain jwt
        transports: [
            //display all logs to console
            new winston.transports.Console({
                /*
                timestamp: function() {
                    var d = new Date();
                    return d.toString(); 
                },
                */
                level: (process.env.DEBUG?'debug':'info'),
                colorize: process.stdout.isTTY,
            }),
        ]
    },
}

