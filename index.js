'use strict';

var path = require('path')
  , fs = require('fs')
  , util = require('util');

var async = require('async')
  , mkdirp = require('mkdirp');

var Emitter = require('./lib/emitter.js')
  , Job = require('./lib/job.js')
  , helpers = require('./lib/helpers.js');

var KEWKEW_UID = 0;

function KewKew(worker, options) {
  Emitter.call(this);

  this._queue = null;
  this._destroyed = false;

  this.worker = worker;
  var name = 'kewkew-' + (++KEWKEW_UID);
  this.options = {
      directory: path.join('.', name)
    , autoStart: true
    , concurrency: 4
    , reloadConcurrency: 16
    , delayEarlyJob: 100
    , retryFailedJobs: false
    , maxJobFailures: 3
  };
  helpers.applyOptions(this.options, options);
  this.options.directory = path.resolve(this.options.directory);
  this._init();
}

util.inherits(KewKew, Emitter);

KewKew.prototype._init = function() {
  var _this = this;
  this._initDataDirectory();
  this._initQueue();
  this._reload(function(err) {
    if (err) return _this.trigger('error', err);
    _this.trigger('ready');
    if (_this.options.autoStart) {
      _this._queue.resume();
    }
  });
};

KewKew.prototype._initDataDirectory = function() {
  mkdirp.sync(this.options.directory);
};

KewKew.prototype._initQueue = function() {
  var _this = this;
  var queue = async.priorityQueue(this._worker.bind(this), this.options.concurrency);
  _this._queue = queue;
  queue.pause();
  queue.saturated = function() {
    _this.trigger('saturated');
  };
  queue.empty = function() {
    _this.trigger('empty');
  };
  queue.drain = function() {
    _this.trigger('drain');
  };
};

KewKew.prototype._reload = function(callback) {
  var _this = this;
  fs.readdir(this.options.directory, function(err, files) {
    if (err) return callback(err);
    async.parallelLimit(files.map(function(f) {
      var file = path.join(_this.options.directory, f);
      return async.apply(Job.fromDisk, file);
    }), _this.options.reloadConcurrency, function(err, jobs) {
      if (err) return callback(err);
      (jobs || []).map(_this._enqueue.bind(_this));
    });
  });
};

KewKew.prototype._worker = function(job, callback) {
  var _this = this;
  var timestamp = new Date().getTime();
  job.processing = true;
  if (job.options.scheduled <= timestamp) {
    job.attempts++;
    try {
      this.worker(job, callback);
    }
    catch (err) {
      return callback(err);
    }
  }
  else {
    setTimeout(function() {
      _this._enqueue(job);
    }, this.options.delayEarlyJob);
  }
};

KewKew.prototype._onJobComplete = function(err) {
  if (err) {
    this.trigger('job:error', err, job);
    this.trigger('error', err);
    if (this.options.retryFailedJobs && job.attempts <= this.options.maxJobFailures) {
      this.retry(job);
    }
  }
  else {
    this.trigger('job:complete', job);
  }
};

KewKew.prototype._enqueue = function(job) {
  job.processing = false;
  job.options.scheduled = job.options.scheduled || new Date().getTime();
  this._queue.push(job, job.options.scheduled, this._onJobComplete.bind(this));
};

KewKew.prototype.pause = function() {
  if (!this._queue.paused) {
    this._queue.pause();
    this.trigger('pause');
  }
  return this;
};

KewKew.prototype.resume = function() {
  if (this._queue.paused) {
    this._queue.resume();
    this.trigger('resume');
  }
  return this;
};

KewKew.prototype.destroy = function() {
  this._destroyed = true;
  this._queue.kill();
  this.trigger('end');
  this._queue = null;
  return this;
};

KewKew.prototype.push = function(data, options, callback) {
  var _this = this;
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = Object.create(options); // in case people reuse options object
  options.scheduled = options.scheduled || new Date().getTime();
  if (options.delay) {
    options.scheduled += options.delay;
    delete options.delay;
  }
  var job = new Job(data, options, this.options.directory);
  job.persist(function(err) {
    if (err) return callback(err);
    _this._enqueue(job);
    _this.trigger('job:queue', job);
    callback(null, job);
  });
  return this;
};

KewKew.prototype.retry = function(job) {
  if (job.processing) {
    this._enqueue(job);
    this.trigger('job:retry', job);
    this.trigger('job:queue', job);
  }
  else {
    throw new Error('Cannot retry job because it is unprocessed');
  }
};

KewKew.Job = Job;

module.exports = KewKew;
