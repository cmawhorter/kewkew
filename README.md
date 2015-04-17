# kewkew

Pew pew... but with k's.

## What is it?

A single threaded persistent job queue.  Jobs are immediately written to disk and reloaded on restart.

Wraps [async's priorityQueue](https://github.com/caolan/async#priorityQueue).

## Why

All the node job queues require redis, which doesn't make a very good store for queued jobs. (see below)

## Features

  - Delayed/Scheduled jobs
  - Events
  - Persistence 
  - Retry failed jobs
  - Archiving permanent fail/success job data

## Installation

`npm install cmawhorter/kewkew`

## Basic Usage

See the examples directory.

```javascript
var KewKew = require('kewkew');
var queue = new KewKew(function worker(job, callback) {
  console.log(job.data + 1);
  callback();
});
queue.push(1); // worker console.logs "2"
queue.push(2); // worker console.logs "3"

// or better yet... ensure the job is successfully on disk
queue.push(3, function(err) {
  if (err) {
    // There was an error while persisting the job to disk.  e.g. out of disk space
    throw err;
  }
  // do stuff now that we know the job won't be lost
}); 
```

## Options

Pass options as the second argument i.e. `new KewKew(workerFunction, options)`.  These are the defaults:

```javascript
{
    // path on disk where you want to store job files (it will be mkdirp'd)
    directory: path.join('.', name)

    // start processing jobs as soon as ready
  , autoStart: true

    // concurrent tasks (async.queue's concurrency)
  , concurrency: 4

    // when reloading, number of files to process at a time
  , reloadConcurrency: 16

    // kewkew continuously attempts to process jobs even if they've been 
    // scheduled in the future. 
    // if a job is processed and found to be scheduled 
    // in the future, this is the delay imposed before attempting 
    // to process again
    // e.g. 
    //    1. queue.push(a job that should run in an hour)
    //    2. queue still tries to process the job immediately
    //    3. worker will sleep 1000ms before re-queuing the job
    // note: don't set this too high because the worker cannot process other 
    //   jobs while it waits
  , delayEarlyJob: 1000

    // retry failed jobs (worker returns error) automatically 
  , retryFailedJobs: false

    // maximum automatic retries before job fails permanently
    // set to <= 0 to disable
  , maxJobFailures: 3

    // delay the job this much before it can be processed again
  , retryFailedJobDelay: 15000

    // delete job file when it completes successfully
    // note: setting this to true will set moveSuccessfulJobs to false
  , destroySuccessfulJobs: false

    // delete job file when it fails permanently 
    // note: setting this to true will set moveFailedJobs to false
  , destroyFailedJobs: false

    // when a job completes successfully, rename the job file but don't remove it
    // (renamed file will be ignored during reload and it's up to you to clean up)
    // note: setting this to true will set destroySuccessfulJobs to false
  , moveSuccessfulJobs: true

    // when a job fails permanently, rename the job file but don't remove it
    // (renamed file will be ignored during reload and it's up to you to clean up)
    // note: setting this to true will set destroyFailedJobs to false
  , moveFailedJobs: true

    // set to true to indent json job data in files
  , prettifyJSON: false
}
```

## TODO

  - A nicer shutdown
  - bull/kue compatible API to be a drop-in replacement
  - Some kind of distribution/clustering
  - Lazy loading of job data from disk (right now everything loaded into memory on init)
  - Tests

## Other job queues

  - https://github.com/OptimalBits/bull (This is what I've been using unhappily, but it gets the job done)
  - https://github.com/Automattic/kue (Last time I used this it was buggy and abandoned, though there seems to be new activity on the project)
  - https://github.com/threez/file-queue (Found this while looking for an existing project like this)

## Why redis isn't good for a job queue

Redis as a store for a job queue is all well and good until you run out of memory.  Once that happens, redis will literally shit all over you.  Literally.

Redis requires RAM to persist to disk, but since you don't have that it just errors and that will go on until the OS kills the process -- along with all your un-persisted jobs.

Now... you could write the jobs to the database prior to inserting them into redis and then do some kind of sync on restart and all that other stuff.  This is the path I started down before I realized how insane it was and wrote this project.

## Why disk?

RAM isn't cheap but SSDs are.  
