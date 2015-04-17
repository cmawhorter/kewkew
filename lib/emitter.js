'use strict';

var events = require('events')
  , util = require('util');

function Emitter() {
  events.EventEmitter.call(this);
}

util.inherits(Emitter, events.EventEmitter);

Emitter.prototype.trigger = function() {
  var _this = this
    , args = arguments;
  setImmediate(function() {
    _this.emit.apply(_this, args);
  });
};

module.exports = Emitter;
