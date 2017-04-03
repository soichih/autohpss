#!/bin/env node

const fs = require('fs');
const winston = require('winston');
const config = require('./config');
const sqlite3 = require('sqlite3');
const async = require('async');
const path = require('path');

const spawn = require('child_process').spawn;
const logger = new winston.Logger(config.logger.winston);


var db = new sqlite3.Database(config.sqlite_path);
db.serialize(()=>{
    db.run("CREATE TABLE IF NOT EXISTS files (path TEXT, mtime INTEGER, tarid INTEGER)");
    db.run("CREATE INDEX IF NOT EXISTS files_index ON files (path,mtime)");
});

var rootdir = process.argv[2];
if(!rootdir) {
    logger.error("Please specify directory name to archive");
    process.exit(1);
}
if(!path.isAbsolute(rootdir)) {
    logger.error("Please specify an absolute path");
    process.exit(1);
}

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
            logger.info("closing..");
            db.close(function() {
                logger.info("closed");
            });
        });
    });
});

/*
logger.info("walking directories to find files that needs to be archived");
async.eachSeries(config.rootdirs, function(rootdir, next_dir) {
    walk(rootdir, handle_batch, next_dir);
}, function(err) {
    if(err) logger.error(err);
    handle_batch(function(err) {
        if(err) logger.error(err);
        logger.info("closing..");
        db.close(function() {
            logger.info("closed");
        });
    });
});
*/


//jvar last_run_date = new Date();
//last_run_date.setDate(last_run_date.getDate()-10);

//console.log(last_run_date);
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


