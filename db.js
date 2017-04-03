#!/bin/env node

const winston = require('winston');
const config = require('./config');
const sqlite3 = require('sqlite3');
const path = require('path');
const mkdirp = require('mkdirp');

const logger = new winston.Logger(config.logger.winston);

exports.getdb = function(cb) {

    //make sure config.sqlite_path basedir exists
    mkdirp(path.dirname(config.sqlite_path), (err)=>{
        if (err) return cb(err);
        var db = new sqlite3.Database(config.sqlite_path);
        db.serialize(()=>{
            db.run("CREATE TABLE IF NOT EXISTS files (path TEXT, mtime INTEGER, tarid INTEGER)");
            db.run("CREATE INDEX IF NOT EXISTS files_index ON files (path,mtime)");
        });
        cb(null, db);
    });
}
