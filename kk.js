#!/bin/env node

const winston = require('winston');
const child_process = require('child_process');
const which = require('which');

const config = require('./config');
const logger = new winston.Logger(config.logger.winston);

exports.testSync = function(cb) {
    logger.debug("testing");    
    if(!process.env.HPSS_AUTH_METHOD || process.env.HPSS_AUTH_METHOD != "keytab") {
        logger.error("HPSS ENVs not set. Please run kktgen");

        //run kktgen
        //var ret = child_process.spawnSync(__dirname+"/node_modules/kktgen/kktgen.sh", {stdio: [0,1,2]});
        //if(ret.status != 0) process.exit(ret.status);
        process.exit(1);
    }

    which('htar', (err)=>{
        if(err) {
            logger.error("can't find htar command in path. Try \"module load hpss\"?");
        } else cb();
    });
}
