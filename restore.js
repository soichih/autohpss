#!/usr/bin/env node

const fs = require('fs');
const winston = require('winston');
const async = require('async');
const assert = require('assert');
const spawn = require('child_process').spawn;
const argv = require('minimist')(process.argv.slice(2), {boolean:'d'});
const path = require('path');

const config = require('./config');
const logger = new winston.Logger(config.logger.winston);
const kk = require('./kk');

if(argv.h) {
    console.log(fs.readFileSync(__dirname+"/README.md").toString());
    process.exit(0);
}

var _path = argv._[0];
if(!_path) {
    //when we deprecate non-real path, we can just use process.cwd()
    if(process.env.PWD)  {
        logger.info("file/dir path not specified - using PWD");
        _path = process.env.PWD;
    } else {
        logger.error("file/dir path not specified and PWD is not set");
        process.exit(2);
    }
}

if(!path.isAbsolute(_path.toString())) {
    //when we deprecate non-real path, we can just do rootdir = path.resolve(rootdir)
    if(process.env.PWD) {
        _path = process.env.PWD+'/'+_path;
        logger.info("relative path specified. Using PWD:", _path);
    } else {
        logger.error("PWD not set.. please specify an absolute path");
        process.exit(2);
    }
}

if(argv.d) {
    logger.info("Running in dry-run mode");
}

kk.testSync(run);

function run() {
    require('./db').getdb((err, db)=>{
        if(err) throw err;

        //let's try finding as a file
        let realpath = fs.realpathSync(_path);
        db.get("SELECT path, max(mtime) as max_mtime, tarid FROM files WHERE (path = ? or path = ?) GROUP BY path", _path, realpath, function(err, file) {
            if(err) {
                if(err.code == "SQLITE_BUSY") return logger.error("Database locked. Archive process still running?");
                throw err;
            }
            if(!file) {
                //not archived, or it's directory - let's try as directory..
                //append / to prevent picking up /dirA, /dirB, /dirC..
                if(_path[_path.length-1] != '/') _path = _path+"/"; 
                if(realpath[realpath.length-1] != '/') realpath = realpath+"/"; 

                var files = [];
                db.each("SELECT path, max(mtime) as max_mtime, tarid FROM files WHERE (path LIKE ? or path LIKE ?) GROUP BY path", [_path+"%", realpath+"%"], function(err, file) {
                    if(err) {
                        if(err.code == "SQLITE_BUSY") return logger.error("Database locked. Previous archive process still running?");
                        throw err;
                    }
                    files.push(file);
                }, function() {
                    if(files.length == 0) {
                        logger.error(_path, "not in archive");
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
            async.eachSeries(files, function(file, next_file) {
                fs.stat(file.path, (err, stats)=>{
                    if(err) {
                        if(argv.d) {
                            logger.info("need-to-restore", file.path);
                            return next_file();
                        } else {
                            //file doesn't exist
                            var hpss_path = config.hpss_path+"/"+file.tarid+".tar";
                            logger.info("restoring",file.path,"from",hpss_path);
                            logger.debug('htar', ['-x', '-v', '-m', '-p', '-f', hpss_path, file.path], {cwd: "/"});
                            var htar = spawn('htar', ['-x', '-v', '-m', '-p', '-f', hpss_path, file.path], {cwd: "/"});
                            if(htar.stdout) htar.stdout.on('data', (data)=>{
                                logger.debug(data.toString());
                            }); 
                            if(htar.stderr) htar.stderr.on('data', (data)=>{
                                logger.error(data.toString());
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
}

