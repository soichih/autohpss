# Automated HPSS archive / retrieval system

A simple, straightforward way to archive and restore stuff to/from HPSS(SDA).

## Prerequisite

This system assumes you have HPSS(SDA) account.. If not, create it at 

> https://access.iu.edu/Accounts

Undergraduate needs a faculty sponsor (see https://kb.iu.edu/d/aczn). If you are eligible but not seeing SDA account listed, please send email to store-admin@iu.edu and ask them to give you access to SDA.

autohpss uses `kerberos token` to access HSI. If you don't know what it is, simply use `kktgen` command to setup your keytab.

```
$ module load nodejs
$ kktgen
IU username: hayashis
IU password: 
Keytab successfully created.
```

## Loading autohpss

autohpss is currently installed on Karst and BigRed2 as nodejs/npm module. 

```
$ module load nodejs hpss
```

You are now ready to use autohpss commands!

## archive

In order to archive your files, directories, navigate to the directory where you want to archive all files and directories under it and run `archive`.

```
$ cd /N/dc2/projects/o3d/O3D_STN
$ archive
```

`archive` command will recursively walk through a specified directory and find
any files that are `new`, or `modified` since you previously run this command. It then creates batches of files that are roughtly 30GB in size
and transfer them to your SDA account using htar. 

autohpss keeps up with list of files in local sqlite3 DB (~/.config/autohpss) along with modified data and which htar archive the files belongs.

You should run `archive` periodically, or setup a cron job on a machine that you have access to which will 1) ssh to karst 2) run archive at desired interval. Please note - arhcive command will store all files that are modified (not just new). If you have a files that are frequently updated, to prevent too many copies to be created in HPSS, you should either not archive those files, or archive them less frequently. 

> In the future, I will provide a functionality to automatically purge older versions of the same file in HPSS (maybe only keep 3 latest copies?)

You can specify `-d` to do dry-run of archive to show which files needs to be archived.

You can also specify a Path that you'd like to archive 

```
$ archive /N/dc2/projects/o3d/O3D_STN
```

## restore 

To restore files, simply run restore command with the directory / file path that you'd like to restore.

```
$ restore /N/dc2/projects/o3d/O3D_STN/derivatives/preprocess/sub-0001
```

`restore` command will only restore files that are missing. If archived file already exists, it will skip the file. You are safe to run this command as often as you'd like (like at top of your job script). If the file you have archived is locally modified (with newer timestamp), it will display warning - that you should re-archive those files.

You can specify `-d` option run a dry run to show which files needs to be restored without actually restoring.

## restore in PBS script.

For any workflow that read data from dc2, you should update it so that it will run restore command for each input file/directory that you use in your workflow (*restore only files that you actually use!*). Be sure to add extra walltime in case files don't exist on dc2 and need to pull from HPSS tape (2-3 hours?)

```
#!/bin/bash
#PBS -l nodes=1:ppn=16:dc2,walltime=6:00:00
#PBS -N app-dtiinit
#PBS -V 
cd $PBS_O_WORKDIR

module load hpss nodejs
restore /N/dc2/scratch/hayashis/neuro/commondata
restore /N/dc2/scratch/hayashis/neuro/subject_111111
restore /N/dc2/scratch/hayashis/neuro/subject_222222

module load matlab 
module load spm 
module load fsl

... run your applicaiton using data restored above ...

#After successful completion of your job, archive any output files
archive /N/dc2/scratch/hayashis/neuro/derivatives

```

You could run `archive` command on your entire project directories, but you should avoid if if you could; `archive` command will archive *all* new/modified files under the specified directory recursively. 

## Why does this exist?

Currently, dc2 is >90% full. I believe that a good chunk of that data [according to users who I talked to] is due to user artificially retaining data by running "access time hacking" script to change the access time of the files within user's directory. They do this because they don't have access to SDA or don't have time to learn about SDA/HPSS. 

This system will allow those users easier way to manage archive / restore files so that they no longer have to rely on access time hacking scripts, which will then reduces the disk usage on dc2.



