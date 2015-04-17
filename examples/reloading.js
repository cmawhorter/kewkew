'use strict';

// On ready, checks to see if jobs exist.  If they do, they're processed.  Otherwise, exits (re-run to have the jobs reloaded and processed)

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
  autoStart: false,
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

queue.once('ready', function() {
  console.info('queue ready');
  if (!queue.count()) {
    var tasks = [];
    for (var i=0; i < 10; i++) {
      tasks.push(async.apply(queue.push.bind(queue), i));
    }
    async.parallel(tasks, function(err) {
      if (err) throw err;
      console.log('queued jobs');
      process.exit();
    });
  }
  else {
    queue.resume();
  }
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
