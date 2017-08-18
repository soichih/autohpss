#!/usr/bin/env node

const fs = require('fs');
const winston = require('winston');
const config = require('./config');
const async = require('async');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2), {boolean:'d'});

const spawn = require('child_process').spawn;
const logger = new winston.Logger(config.logger.winston);
const kk = require('./kk');

if(argv.h) {
    console.log(fs.readFileSync(__dirname+"/README.md").toString());
    process.exit(0);
}

var rootdir = argv._[0];
if(!rootdir) {
    //when we deprecate non-real path, we can just use process.cwd()
    if(process.env.PWD) {
        rootdir = process.env.PWD;
        logger.info("archive directory not specified - using PWD", rootdir);
    } else {
        logger.error("PWD not set.. please specify an absolute path");
        process.exit(2);
    }
}
if(!path.isAbsolute(rootdir)) {
    //when we deprecate non-real path, we can just do rootdir = path.resolve(rootdir)
    if(process.env.PWD) {
        rootdir = process.env.PWD+'/'+rootdir;
        logger.info("relative path specified. Using PWD:", rootdir);
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
    require('./db').getdb(function(err, db) {
        if(err) throw err;

        var errors = [];
        fs.stat(rootdir, (err, stats)=>{
            if(err) throw err;
            if(stats.isDirectory()) {
                walk(rootdir, handle_batch, function(err) {
                    if(err) errors.push(err);
                    
                    //handle the last batch..
                    handle_batch(err=>{
                        if(err) errors.push(err);
                        logger.info("closing db...");
                        db.close(function() {
                            //all done
                            if(errors.length > 0) {
                                logger.error("couldn't archive all files");
                                logger.error(errors);
                                process.exit(1);
                            }
                        });
                    });
                });
            } else if(stats.isFile()) {
                handle_file(rootdir, stats, err=>{
                    handle_batch(err=>{
                        if(err) errors.push(err);
                        logger.info("closing db...");
                        db.close(function() {
                            //all done
                            if(errors.length > 0) {
                                logger.error("couldn't archive all files");
                                logger.error(errors);
                                process.exit(1);
                            }
                        });
                    });  
                }, cb=>{
                    cb();
                });
            } else {
                logger.error(rootdir,"is not a directory or file");
                process.exit(1);
            }
        });

        //walk directory and find files that are modified before configured date
        //until it fills up configured size
        var total_size = 0;
        var newfiles = [];

        function handle_file(fullpath, stats, cb, full) {
            mtime = stats.mtime.getTime();
            var real_fullpath = fs.realpathSync(fullpath);
            //search using both old and real path for backward compatibility (until we deprecate old paths)
            //I wonder if I could just migrate old paths in db?
            db.get("SELECT * FROM files WHERE (path = ? or path = ?) and mtime = ?", [fullpath, real_fullpath, mtime], 
            function(err, row) {
                if(err) {
                    errors.push(err);
                    return cb();
                }
                if(!row) {
                    logger.info("need-to-archive", real_fullpath, mtime);
                    newfiles.push({path: real_fullpath, mtime: mtime});
                    total_size += stats.size; 
                    if(total_size > config.batch_size) {
                        full(cb); //I have a full batch!
                    } else cb();
                } else cb();
            });
        }

        function walk(_path, full, done) {
            logger.info("reading", _path);
            fs.readdir(_path, (err, files)=> {
                if(err) return done(err);
                async.eachSeries(files, function(file, next_file) {
                    var fullpath = _path+"/"+file;
                    fs.stat(fullpath, (err, stats)=>{
                        if(err) {
                            logger.error(err);
                            errors.push(err);
                            return next_file();
                        }
                        if(stats.isDirectory()) {
                            walk(fullpath, full, next_file);
                        } else if(stats.isSymbolicLink()) {
                            logger.warning("ignoring symlink");
                            next_file();
                        } else if(stats.isFile()) {
                            handle_file(fullpath, stats, next_file, full);
                        }
                    });
                }, done);
            });
        }

        function handle_batch(cb) {
            if(newfiles.length == 0) {
                logger.info("nothing to archive");
                return cb();
            }

            logger.log("processing batch.. ", total_size, newfiles.length);

            //get next tar-id to use
            db.get("SELECT max(tarid) as max FROM files", function(err, row) {
                if(err) return cb(err);
                var next_tarid = 0;
                if(row.max !== null) {
                    next_tarid = row.max+1;
                }

                var hpss_path = config.hpss_path+"/"+next_tarid+".tar";
                if(argv.d) {
                    //dry run.. skip to next batch
                    cb();
                } else {
                    logger.info("archiving", hpss_path);
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
                            logger.info("storing files to db");
                            var stmt = db.prepare("INSERT INTO files VALUES (?, ?, ?)");
                            newfiles.forEach((file)=>{
                                stmt.run(file.path, file.mtime, next_tarid);
                            });
                            stmt.finalize(); //blocking?
                        });
                        logger.info("done storing files to db");

                        total_size = 0;
                        newfiles = [];
                        cb();
                    });
                    newfiles.forEach((file)=>{
                        htar.stdin.write(file.path+'\n');
                    });
                    htar.stdin.end();
                }
            });
        }
    });
}
