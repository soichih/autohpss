# Automated HPSS archive / retrieval system

## This system has 2 component

1) Automated HPSS Archival

Script that should be run periodically (via cron or remote-cron) to find any files that are created / modified and 
store them to SDA - file path will be stored in a local sqlite DB with link to the SDA and path inside the htar (if it's htar)

2) *check* command

check command is given a path to a data file that user is wanting to access. If the file already exists, it doesn't do anything. If it doesn't exist, it queries the sqlite DB and if it's there, lookup the SDA path and issue htar/hsi command to download file. If check command is given a directory path, it tries to restore all files under that directory that are registered in the sqlite DB.

## Why?

Currently, dc2 is 97% full. I believe that huge chunk of that data is due to user running "access time hacking" script to artificially change the access time of the data. They do this because they don't know or don't have time to learn about HPSS. This system allows those users to easily manage archive / restore files so that they no longer need to run such scripts, which then reduces the disk usage on dc2.



