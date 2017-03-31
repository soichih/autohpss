
const fs = require('fs');
const winston = require('winston');
const config = require('./config');
const sqlite3 = require('sqlite3');
const async = require('async');

const spawn = require('child_process').spawn;

const logger = new winston.Logger(config.logger.winston);

var db = new sqlite3.Database(config.sqlite_path);
db.serialize(()=>{
    db.run("CREATE TABLE IF NOT EXISTS files (path TEXT, mtime INTEGER)");
    walk(config.rootdir, handle_batch, function(err) {
        console.log("walking done - going to skip the last batch (could be too small)..");
        db.close();
    }); 
});

//jvar last_run_date = new Date();
//last_run_date.setDate(last_run_date.getDate()-10);

//console.log(last_run_date);
//walk directory and find files that are modified before configured date
//until it fills up configured size
var total_size = 0;
var newfiles = [];
function walk(path, full, done) {
    fs.readdir(path, (err, files)=> {
        if(err) throw err;
        async.eachSeries(files, function(file, next_file) {
            fs.stat(path+"/"+file, (err, stats)=>{
                if(err) {
                    logger.error(err);
                    return next_file();
                }
                //console.log(path, file);
                //console.dir(stats);
                if(stats.isDirectory()) {
                    walk(path+"/"+file, full, next_file);
                } else if(stats.isSymbolicLink()) {
                    logger.warning("ignoring symlink");
                    next_file();
                } else if(stats.isFile()) {
                    db.get("SELECT * FROM files WHERE path = ?", path+"/"+file, function(row) {

                        //see if we need to archive this file or not
                        var need_to_archive = false;
                        if(row === null) {
                            //console.log("not listed in db");
                            need_to_archive = true;
                        } else {
                            //console.log("listed in db");
                            if(row.mtime < stats.mtime.getTime()) need_to_archive = true;
                        }

                        if(need_to_archive) {
                            //logger.debug("need to archive", file);
                            if(total_size+stats.size < config.batch_size) {
                                total_size += stats.size; 
                                newfiles.push({path: path+"/"+file, mtime: stats.mtime});
                                next_file();
                            } else {
                                full(next_file); //I have a full batch!
                            }
                        } else next_file();
                    });
                }
            });
        }, done);
    });
}

function handle_batch(cb) {
    console.log("batch is full - processing", total_size, newfiles.length);
    //console.dir(newfiles);

    /*
    //handle batch
    async.eachSeries(newfiles, function(file, next_file) {
        //var stmt = db.prepare("INSERT INTO files VALUES (?, ?)");
        //stmt.run(file.path, file.mtime);

    }, function(err) {
        stmt.finalize();
        console.log("done processing batch - resuming walk");
        //reset batch
        total_size = 0;
        newfiles = [];
        cb();
    });
    */
    var htar = spawn('htar', ['-c', 'test.tar', '-L', '-']);
    newfiles.forEach((file)=>{
        htar.stdin.write(file.path);
    });
    htar.stdout.on('data', (data)=>{
        console.log(data);
    }); 
    htar.stderr.on('data', (data)=>{
        console.error(data);
    }); 
    htar.on('close', (code)=>{
        console.dir(code);
        cb();
    });
}


