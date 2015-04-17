'use strict';

module.exports = {
  applyOptions: function applyOptions(target, options) {
    options = options || {};
    for (var k in options) {
      if (k in target) {
        target[k] = options[k];
      }
      else {
        throw new Error('Invalid option "' + k + '"');
      }
    }
  },

  JSON: function(str) {
    try {
      return JSON.parse(str);
    }
    catch (err) {
      return {
          error: err.message
        , json: str && str instanceof Buffer ? str.toString() : str
      };
    }
  },

  filterDotFiles: function(files) {
    return (files || []).filter(function(element) {
      return element[0] !== '.';
    });
  }
}
