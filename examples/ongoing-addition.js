'use strict';

// Jobs contain an int and workers multiply that int by 2 with a 100ms delay.

// This example:
//   - Seeds the queue with 10 jobs
//   - Creates a new job every time a job completes (up to 100)
//   - Automatically deletes any successful jobs
//   - Logs all events to the console as they happen


var async = require('async');
var KewKew = require('../index.js');

var worker = function workerTest(job, callback) {
  setTimeout(function() {
    console.log('Job (%s) work %s * 2 = %s', job.id, job.data, job.data * 2);
    callback();
  }, 100);
};

var queue = new KewKew(worker, {
  directory: './test-data',
  destroySuccessfulJobs: true,
  prettifyJSON: true
});

[
  'ready', 'error', 'saturated', 'empty', 'drain', 'pause', 'resume', 'end',
  'job:error', 'job:complete', 'job:queue', 'job:retry', 'job:destroy', 'job:fail'
].forEach(function(eventName) {
  queue.on(eventName, function(job) {
    console.log('event -> %s', eventName, 0 === eventName.indexOf('job:') ? '(' + job.id + ')' : '');
  });
});

var tasks = [];
for (var i=0; i < 10; i++) {
  tasks.push(async.apply(queue.push.bind(queue), i));
}
async.parallel(tasks, function(err) {
  if (err) throw err;
  console.log('queued jobs');
});

var ongoingCreate = 100;
queue.on('job:complete', function() {
  if (--ongoingCreate > 0) {
    var randomInt = Math.floor(Math.random() * 10000);
    console.log('adding new job...', randomInt, ongoingCreate);
    queue.push(randomInt);
  }
});

queue.once('ready', function() {
  console.info('queue ready');
});

queue.once('drain', function() {
  console.info('queue done; destroying...');
  queue.destroy();
});

queue.once('end', function() {
  console.info('queue destroyed');
  process.exit();
});

setInterval(function() {
  console.log('Waiting for jobs...', new Date());
}, 5000);
