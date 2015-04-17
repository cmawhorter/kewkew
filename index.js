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
    , delayEarlyJob: 1000
    , retryFailedJobs: false
    , retryFailedJobDelay: 15000
    , destroySuccessfulJobs: false
    , destroyFailedJobs: false
    , moveSuccessfulJobs: true
    , moveFailedJobs: true
    , maxJobFailures: 3
    , prettifyJSON: false
  };
  if (true === options.destroySuccessfulJobs) { // disables these options
    options.moveSuccessfulJobs = false;
  }
  if (true === options.destroyFailedJobs) { // disables these options
    options.moveFailedJobs = false;
  }
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
    async.parallelLimit(helpers.filterDotFiles(files).map(function(f) {
      var file = path.join(_this.options.directory, f);
      return async.apply(Job.fromDisk, file);
    }), _this.options.reloadConcurrency, function(err, jobs) {
      if (err) return callback(err);
      (jobs || []).map(_this._enqueue.bind(_this));
      callback(null);
    });
  });
};

KewKew.prototype._worker = function(job, callback) {
  // callback is special. first param is err, second param is job being
  // processed.  if job is excluded no job related events are fired
  var _this = this;
  var timestamp = new Date().getTime();
  // console.log('Entering Worker for Job %s', job.id);
  job.processing = true;
  if (job.options.scheduled <= timestamp) {
    job.attempts++;
    // console.log('Processing...', job.id, job.attempts);
    this._persist(job, function(err) {
      if (err) return callback(err, job);
      try {
        _this.worker(job, function(err) {
          callback(err, job);
        });
      }
      catch (err) {
        return callback(err, job);
      }
    });
  }
  else {
    // console.log('Too Soon. Delaying...', job.id);
    setTimeout(function() {
      _this._enqueue(job);
      callback(null, null);
    }, this.options.delayEarlyJob);
  }
};

KewKew.prototype._persist = function(job, callback) {
  var _this = this;
  job.persist(function(err) {
    if (err) {
      _this.trigger('error', err);
      callback(err);
      return;
    }
    callback(null);
  });
};

KewKew.prototype._destroy = function(job, callback) {
  job.destroy(function(err) {
    if (err) {
      _this.trigger('job:error', err, job);
      _this.trigger('error', err);
      callback(err);
      return
    }
    callback(null);
  });
};

KewKew.prototype._onJobComplete = function(err, job) {
  var _this = this;
  if (err) {
    this.trigger('job:error', err, job);
    this.trigger('error', err);
    if (this.options.retryFailedJobs) {
      if (this.options.maxJobFailures <= 0 || job.attempts < this.options.maxJobFailures) {
        this.retry(job);
      }
      else {
        this.trigger('job:fail', job);
        if (this.options.moveFailedJobs) {
          fs.rename(job.file, path.join(job.directory, '.failed-' + job.id), function(err) {
            if (err) {
              _this.trigger('error', err);
            }
          });
        }
        else if (this.options.destroyFailedJobs) {
          this._destroy(job, function(err) {
            if (!err) {
              _this.trigger('job:destroy', job);
            }
          });
        }
      }
    }
  }
  else if (job) {
    this.trigger('job:complete', job);
    if (this.options.moveSuccessfulJobs) {
      fs.rename(job.file, path.join(job.directory, '.success-' + job.id), function(err) {
        if (err) {
          _this.trigger('error', err);
        }
      });
    }
    else if (this.options.destroySuccessfulJobs) {
      this._destroy(job, function(err) {
        if (!err) {
          _this.trigger('job:destroy', job);
        }
      });
    }
  }
};

KewKew.prototype._enqueue = function(job) {
  var _this = this;
  job.processing = false;
  this._queue.push(job, job.options.scheduled, _this._onJobComplete.bind(_this));
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
    options = null;
  }
  options = Object.create(options || {}); // in case people reuse options object
  options.prettifyJSON = this.options.prettifyJSON;
  options.scheduled = options.scheduled || new Date().getTime();
  if (options.delay) {
    options.scheduled += options.delay;
    delete options.delay;
  }
  var job = new Job(data, options, this.options.directory);
  this._persist(job, function(err) {
    if (err) {
      callback && callback(err);
    }
    else {
      _this._enqueue(job);
      _this.trigger('job:queue', job);
      callback && callback(null, job);
    }
  });
  return this;
};

KewKew.prototype.count = function() {
  return this._queue.length();
};

KewKew.prototype.retry = function(job, callback) {
  var _this = this;
  if (job.processing) {
    job.options.scheduled += this.options.retryFailedJobDelay;
    this._persist(job, function(err) {
      if (err) {
        _this.trigger('job:error', err, job);
        _this.trigger('error', err);
        callback && callback(err);
      }
      else {
        _this._enqueue(job);
        _this.trigger('job:retry', job);
        _this.trigger('job:queue', job);
        callback && callback(null);
      }
    });
  }
  else {
    throw new Error('Cannot retry job because it is unprocessed');
  }
};

KewKew.Job = Job;

module.exports = KewKew;
