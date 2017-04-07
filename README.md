# Automated HPSS archive / retrieval system

The simplest, most straightforward way to archive and restore stuff to/from HPSS(SDA).

## Prerequisite

This system assumes you have HPSS(SDA) account..
> https://kb.iu.edu/d/alja 

and you have keytab based authentication configured.
> https://kb.iu.edu/d/aumh

You can use `kktgen` command to easily setup your keytab

```
$ module load nodejs
$ kktgen
IU username: hayashis
IU password: 
Keytab successfully created.
```

Once configured, you should be able to run `hsi ls` without entering user/pass.

```
$ module load hpss
$ hsi ls
/hpss/h/a/hayashis:
_test/          backup/         chunk/          Soichi's Test/  test.tar        
autohpss/       barn.tar        isos/           test/           
```

If you have question on how to do this, please contact me.

## Installation

It's already installed on Karst, but if you want to install this on other systems, do..

```
$ sudo npm install autohpss -g
```

## This system has 2 components

1) archive

```
$ module load nodejs
$ archive /N/dc2/projects/o3d/O3D_STN
```

`archive` command takes a directory name to archive. archive command will recurviely walk through a specified directory and find
any files that are new, or modified since you run this command. It then creates batches of files (roughtly 30GB in size) 
and store them to your SDA account using htar. List of files and modified dates will be stored in local sqlite3 DB (~/.config/autohpss)

Path needs to be an absolute path.

You should run archive periodically, or setup a cron job on a machine that you have access to which will 1) ssh to karst 2) run archive at desired interval. Please note - arhcive command will store all files that are modified (not just new). To prevent too many copies to be created in HPSS, you should either not archive those files, or archive them less frequently. In the future, I will provide a functionality to automatically purge older versions of the same file in HPSS (maybe only keep 3 latest copies?)

2) restore 

```
$ module load nodejs
$ restore /N/dc2/projects/o3d/O3D_STN/derivatives/preprocess/sub-0001
```

You can run `restore` command in login node, or from your workflow script (script that's passed to pbs) to restore files / directories 
recursively inside the specified directory.  If a file exists, it skips. So even though you have 100s of files archived, 
unless they were purged by dc2 system, the restore command will do nothing most of the time - it only restores if files are gone missing.

## Use-case

For any workflow that read/write data from dc2, update it so that before it runs the main part of your workflow, for each input file that it uses, run restore command on each file (*only restore files that you actually use!*) to make sure that they exist on dc2. Be sure to add extra walltime in case files don't exist on dc2 and need to pull from HPSS tape (2-3 hours?)

archive command can run on much less granular fashion than restore, but you should avoid archiving the entire project directory.. (Do you really need everything there?) archive command will archive *all* new/modified files under the specified directory. You can run it after your workflow successfull completes, or automatically(via cron) once a week/month depending on your archival need. 

## Why does this exist?

Currently, dc2 is 97% full. I believe that huge chunk of that data [according to users who I talked to] is due to user artificially retaining data by running "access time hacking" script to change the access time of the data within a given directory. They do this because they don't know or don't have time to learn about SDA/HPSS. 

This system will allow those users easy way to manage archive / restore files so that they no longer have to rely on access time hacking scripts, which will then reduces the disk usage on dc2.

I also believe that such hacking script maybe contributing, in part, to the slow responses of dc2




