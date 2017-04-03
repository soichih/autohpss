#!/bin/env node

const fs = require('fs');
const winston = require('winston');
const async = require('async');
const mkdirp = require('mkdirp');
const assert = require('assert');
const spawn = require('child_process').spawn;

const config = require('./config');
const logger = new winston.Logger(config.logger.winston);

var path = process.argv[2];
if(!path) {
    console.log("Please specify path (filename or directory) to restore");
    process.exit(1);
}

require('./db').getdb(function(err, db) {
    if(err) throw err;

    //let's try finding as a file
    db.get("SELECT path, max(mtime) as max_mtime, tarid FROM files WHERE path = ? GROUP BY path", path, function(err, file) {
        if(err) {
            if(err.code == "SQLITE_BUSY") return logger.error("Database locked. Archive process still running?");
            throw err;
        }
        if(!file) {
            //not archived, or it's directory - let's try as directory
            if(path[path.length-1] != '/') path = path+"/"; //append / to prevent picking up /dirA, /dirB, /dirC..
            var files = [];
            db.each("SELECT path, max(mtime) as max_mtime, tarid FROM files WHERE path LIKE ? GROUP BY path", [path+"%"], function(err, file) {
                if(err) {
                    if(err.code == "SQLITE_BUSY") return logger.error("Database locked. Archive process still running?");
                    throw err;
                }
                files.push(file);
            }, function() {
                restore(files);
            });
        } else {
            //it's a file! check for mtime
            restore([file]);
        }
    });

    function restore(files) {
        async.forEach(files, function(file, next_file) {
            fs.stat(file.path, (err, stats)=>{
                if(err) {
                    //file doesn't exist
                    var hpss_path = config.hpss_path+"/"+file.tarid+".tar";
                    logger.debug("restoring file ",hpss_path, file.path);
                    var htar = spawn('htar', ['-x', '-v', '-m', '-p', '-f', hpss_path, file.path], {cwd: "/"});
                    htar.stdout.on('data', (data)=>{
                        console.log(data.toString());
                    }); 
                    htar.stderr.on('data', (data)=>{
                        console.error(data.toString());
                    }); 
                    htar.on('close', (code)=>{
                        if(code != 0) next_file("htar -x failed with code:"+code);
                        else {
                            //-m updates the modified time locally, so I need to update the mtime
                            fs.stat(file.path, (err, new_stats)=>{
                                if(err) next_file(err);
                                logger.debug("successfully restored - now updating mtime in archive", file, new_stats.mtime.getTime());
                                db.run("UPDATE files SET mtime = ? WHERE path = ? and mtime = ?", 
                                    new_stats.mtime.getTime(), file.path, file.max_mtime);
                                next_file();
                            });
                        }
                    });
                } else {
                    //file already exist - check for mtime
                    var mtime = stats.mtime.getTime();
                    if(file.max_mtime > mtime) {
                        logger.warning(file.path, "already exists, but file in archive is stale. You should rerun archive.");
                        next_file();
                    } else {
                        //logger.debug("file", file.max_mtime, "mtime", mtime);
                        assert(file.max_mtime == mtime);
                        logger.debug(file.path, "already exists and archive is up-to-date");
                        next_file();
                    }
                }
            });
        }, function(err) {
            if(err) throw err;
            logger.debug("closing");
            db.close();
        });
    }
});
