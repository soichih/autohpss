#!/bin/env node

const fs = require('fs');
const winston = require('winston');
const config = require('./config');
const async = require('async');
const path = require('path');

const spawn = require('child_process').spawn;
const logger = new winston.Logger(config.logger.winston);

var rootdir = process.argv[2];
if(!rootdir) {
    logger.error("Please specify directory name to archive");
    process.exit(1);
}
if(!path.isAbsolute(rootdir)) {
    logger.error("Please specify an absolute path");
    process.exit(2);
}
if(!process.env.HPSS_AUTH_METHOD || process.env.HPSS_AUTH_METHOD != "keytab") {
    logger.error("Please configure HPSS keytab. You can try genkeytab");
    process.exit(3);
}

require('./db').getdb(function(err, db) {
    if(err) throw err;

    fs.stat(rootdir, (err, stats)=>{
        if(err) throw err;
        if(!stats.isDirectory()) {
            logger.error(rootdir,"is not a directory");
            process.exit(1);
        }
        walk(rootdir, handle_batch, function(err) {
            if(err) logger.error(err);
            handle_batch(function(err) {
                if(err) logger.error(err);
                logger.debug("closing db...");
                db.close(function() {
                    logger.debug("closed");
                });
            });
        });
    });

    //walk directory and find files that are modified before configured date
    //until it fills up configured size
    var total_size = 0;
    var newfiles = [];

    function walk(path, full, done) {
        logger.debug("readdir", path);
        fs.readdir(path, (err, files)=> {
            if(err) return done(err);
            async.eachSeries(files, function(file, next_file) {
                var fullpath = path+"/"+file;
                fs.stat(fullpath, (err, stats)=>{
                    if(err) {
                        logger.error(err);
                        return next_file();
                    }
                    if(stats.isDirectory()) {
                        walk(fullpath, full, next_file);
                    } else if(stats.isSymbolicLink()) {
                        logger.warning("ignoring symlink");
                        next_file();
                    } else if(stats.isFile()) {
                        var mtime = stats.mtime.getTime();
                        db.get("SELECT * FROM files WHERE path = ? and mtime = ?", [fullpath, mtime], function(err, row) {
                            if(!row) {
                                logger.info("need to archive", fullpath, mtime);
                                newfiles.push({path: fullpath, mtime: mtime});
                                total_size += stats.size; 
                                if(total_size > config.batch_size) {
                                    full(next_file); //I have a full batch!
                                } else next_file();
                            } else next_file();
                        });
                    }
                });
            }, done);
        });
    }

    function handle_batch(cb) {
        if(newfiles.length == 0) {
            logger.info("nothing to archive");
            return;
        }

        logger.log("processing batch.. ", total_size, newfiles.length);

        //get next max tarid
        db.get("SELECT max(tarid) as max FROM files", function(err, row) {
            var next_tarid = 0;
            if(row.max !== null) {
                next_tarid = row.max+1;
            }

            var hpss_path = config.hpss_path+"/"+next_tarid+".tar";
            logger.info("htar-ing to ", hpss_path);
            var htar = spawn('htar', ['-P', '-v', '-c', '-f', hpss_path, '-L', '-']);
            htar.stdout.on('data', (data)=>{
                console.log(data.toString());
            }); 
            htar.stderr.on('data', (data)=>{
                console.error(data.toString());
            }); 
            htar.on('close', (code)=>{
                if(code != 0) return cb("htar closed with error code:"+code);

                //store filelists to db
                db.serialize(()=>{
                    logger.debug("storing files to db");
                    var stmt = db.prepare("INSERT INTO files VALUES (?, ?, ?)");
                    newfiles.forEach((file)=>{
                        stmt.run(file.path, file.mtime, next_tarid);
                    });
                    stmt.finalize(); //blocking?
                });
                logger.debug("done storing files to db");

                total_size = 0;
                newfiles = [];
                cb();
            });
            newfiles.forEach((file)=>{
                htar.stdin.write(file.path+'\n');
            });
            htar.stdin.end();
        });
    }
});
