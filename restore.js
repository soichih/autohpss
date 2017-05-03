#!/bin/env node

const fs = require('fs');
const winston = require('winston');
const async = require('async');
const assert = require('assert');
const spawn = require('child_process').spawn;
const argv = require('minimist')(process.argv.slice(2), {boolean:'d'});

const config = require('./config');
const logger = new winston.Logger(config.logger.winston);
const kk = require('./kk');

if(argv.h) {
    console.log(fs.readFileSync(__dirname+"/README.md").toString());
    process.exit(0);
}

var path = argv._[0];
if(!path) {
    //logger.error("Please specify path (filename or directory) to restore");
    //process.exit(1);
    logger.info("file/dir path not specified - using current directory");
    path = process.cwd();
}

if(argv.d) {
    logger.info("Running in dry-run mode");
}

kk.testSync(run);

function run() {
    require('./db').getdb((err, db)=>{
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
                    if(files.length == 0) {
                        logger.error("not in archive");
                        process.exit(1);
                    }
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
                        if(argv.d) {
                            logger.info("need-to-restore", file.path);
                            return next_file();
                        } else {
                            //file doesn't exist
                            var hpss_path = config.hpss_path+"/"+file.tarid+".tar";
                            //var dest = file.path.substring(1); //trim leading '/' to silence htar warning
                            logger.info("restoring",file.path,"from",hpss_path);
                            var htar = spawn('htar', ['-x', '-v', '-m', '-p', '-f', hpss_path, file.path], {cwd: "/"});
                            htar.stdout.on('data', (data)=>{
                                console.log(data.toString());
                            }); 
                            htar.stderr.on('data', (data)=>{
                                console.error(data.toString());
                            }); 
                            htar.on('close', (code)=>{
                                if(code != 0) {
                                    return next_file("htar -x failed with code:"+code);
                                } else {
                                    //-m updates the modified time locally, so I need to update the mtime
                                    fs.stat(file.path, (err, new_stats)=>{
                                        if(err) return next_file(err);
                                        logger.debug("successfully restored - now updating mtime in archive", file, new_stats.mtime.getTime());
                                        db.run("UPDATE files SET mtime = ? WHERE path = ? and mtime = ?", 
                                            new_stats.mtime.getTime(), file.path, file.max_mtime);
                                        return next_file();
                                    });
                                }
                            });
                        }
                    } else {
                        //file already exist - check for mtime
                        var mtime = stats.mtime.getTime();
                        if(file.max_mtime < mtime) {
                            //"already exists, but file in archive is stale. You should rerun archive.");
                            logger.warn("modified (you should re-archive)", file.path);
                            return next_file();
                        } else {
                            //logger.debug("file", file.max_mtime, "mtime", mtime);
                            assert(file.max_mtime == mtime);
                            logger.info("up-to-date",file.path);
                            return next_file();
                        }
                    }
                });
            }, function(err) {
                if(err) throw err;
                db.close(function() {
                    //done
                });
            });
        }
    });
}/*end..run()*/

