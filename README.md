# Automated HPSS archive / retrieval system

## This system has 2 component

1) Automated HPSS Archival

Script that should be run periodically (via cron or remote-cron) to find any files that are created / modified and 
store them to SDA - file path will be stored in a local sqlite DB with link to the SDA and path inside the htar (if it's htar)

2) *check* command

check command is given a path to a data file that user is wanting to access. If the file already exists, it doesn't do anything. If it doesn't exist, it queries the sqlite DB and if it's there, lookup the SDA path and issue htar/hsi command to download file. If check command is given a directory path, it tries to restore all files under that directory that are registered in the sqlite DB.

## Why does this exist?

Currently, dc2 is 97% full. I believe that huge chunk of that data [according to users who I talked to] is due to user artificially retaining data by running "access time hacking" script to change the access time of the data within a given directory. They do this because they don't know or don't have time to learn about SDA/HPSS. 

This system will allow those users easy way to manage archive / restore files so that they no longer have to rely on access time hacking scripts, which will then reduces the disk usage on dc2.

> I also believe that such hacking script maybe contributing, in part, to the slow responses of dc2

## Automated HPSS Archival

### Installation

```
mkdir ~/git
git clone https://github.com/soichih/autohpss ~/git/autohpss
module load nodejs
cd ~/git/autohpss
npm install
cp config.js.sample config.js
```

### Configuration

Edit `~/git/autohpss/config.js`



You will need to run autohpss/archive periodically. You can run it once a week, or once a month. Please note, autohpss will archive the same file if it's modified. To avoid unnecessary archive, 



