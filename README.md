# Automated HPSS archive / retrieval system

The simplest, most straightforward way to archive and restore stuff to/from HPSS(SDA).

## Prerequisite

This system assumes you have HPSS(SDA) account.. If not, create it at 

> https://access.iu.edu/Accounts

(Undergraduate needs a faculty sponsor (see https://kb.iu.edu/d/aczn)

Then, use `kktgen` command to setup your keytab.

```
$ module load nodejs
$ kktgen
IU username: hayashis
IU password: 
Keytab successfully created.
```

kktgen will edit your .bashrc to include a few keytab related export. If it can't update it, it will display an extra instruction.

Finally, run bash to reload your .bashrc

```
$ bash
```

## archive

In order to archive your files, directories, simply run archive command.

```
$ module load nodejs
$ archive /N/dc2/projects/o3d/O3D_STN
```

`archive` command will recursively walk through a specified directory and find
any files that are new, or modified since you previously run this command. It then creates batches of files (roughtly 30GB in size) 
and store them to your SDA account using htar. List of files and modified dates will be stored in local sqlite3 DB (~/.config/autohpss)

Path needs to be an absolute path.

You should run archive periodically, or setup a cron job on a machine that you have access to which will 1) ssh to karst 2) run archive at desired interval. Please note - arhcive command will store all files that are modified (not just new). To prevent too many copies to be created in HPSS, you should either not archive those files, or archive them less frequently. In the future, I will provide a functionality to automatically purge older versions of the same file in HPSS (maybe only keep 3 latest copies?)

## restore 

To restore files, simply run restore command.

```
$ module load nodejs
$ restore /N/dc2/projects/o3d/O3D_STN/derivatives/preprocess/sub-0001
```

`restore` command will restore all files that are archived under specified directory. If files already exist, restore will skip the file and do nothing, so you are safe to run this command at the top of your script everytime you run it.

## Use-case

For any workflow that read data from dc2, update it so that you will run restore command for each input file or directory that you use in your workflow (*only restore files that you actually use!*). Be sure to add extra walltime in case files don't exist on dc2 and need to pull from HPSS tape (2-3 hours?)

archive command can run on much less granular fashion than restore, but you should avoid archiving the entire project directory (Do you really need everything there?). `archive` command will archive *all* new/modified files under the specified directory. You can run it after your workflow successfull completes, or automatically(via cron) once a week/month depending on your archival need. 

## Why does this exist?

Currently, dc2 is 97% full. I believe that huge chunk of that data [according to users who I talked to] is due to user artificially retaining data by running "access time hacking" script to change the access time of the data within a given directory. They do this because they don't know or don't have time to learn about SDA/HPSS. 

This system will allow those users easy way to manage archive / restore files so that they no longer have to rely on access time hacking scripts, which will then reduces the disk usage on dc2.

I also believe that such hacking script maybe contributing, in part, to the slow responses of dc2




