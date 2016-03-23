/**
 * Created by pbaio on 8/21/2015.
 */

"use strict";

var us = require('underscore');

module.exports = {

  toInt: function(value, returnNull) {
    var int = parseInt(value);

    if (us.isNaN(int) || typeof int !== 'number') {
      if (returnNull)
        int = null;
      else
        int = 0
    }

    return int;
  }

};