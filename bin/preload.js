'use strict';

var electron = require('electron');
var util = require('util');

function sendMsg(channel, type, message) {
  electron.ipcRenderer.send(channel, type, message);
}

function doneCallback(errorCount) {
  if (errorCount > 0) {
    sendMsg('error', errorCount);
  }
}

(function(){
  var config = {};

  function configureMocha(config, env) {
    mocha.env = env

    mocha.useColors(config.useColors)
    mocha.bail(config.bail)
    if (config.timeout) {
      mocha.timeout(config.timeout)
    }
    if (config.grep) {
      mocha.grep(config.grep)
    }
    if (config.invert) {
      mocha.invert()
    }

    mocha.setup({
      reporter: config.reporter || Mocha.reporters.Custom
    });
  }

  function createCookie(name, value, days) {
    var expires;
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = '; expires=' + date.toGMTString();
    }
    else {
      expires = '';
    }
    document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
  }

  electron.ipcRenderer.on('execute', function(event, command, opts, env) {
    if (command === 'setConfig') {
      config = opts;
    } else if (command === 'checkForMocha') {
      window.checkForMocha();
    } else if (command === 'addCookie') {
      for (var key in opts) {
        createCookie(key, opts[key], 1); // Default to 1 day.
      }
    } else if (command === 'eval') {
      eval(opts);
    }
  })


  // Taken from nightmare-js
  // listen for console.log
  var defaultLog = console.log;
  console.log = function() {
    var message = util.format.apply(util.format, [].slice.call(arguments));
    sendMsg('console', 'log', message);
    return defaultLog.apply(this, arguments);
  };

  // listen for console.warn
  var defaultWarn = console.warn;
  console.warn = function() {
    var message = util.format.apply(util.format, [].slice.call(arguments));
    sendMsg('console', 'warn', message);
    return defaultWarn.apply(this, arguments);
  };

  // listen for console.error
  var defaultError = console.error;
  console.error = function() {
    var message = util.format.apply(util.format, [].slice.call(arguments));
    sendMsg('console', 'error', message);
    return defaultError.apply(this, arguments);
  };

  // overwrite the default alert
  window.alert = function(message){
    sendMsg('page', 'alert', message);
  };

  // overwrite the default prompt
  window.prompt = function(message, defaultResponse){
    sendMsg('page', 'prompt', message, defaultResponse);
  }

  // overwrite the default confirm
  window.confirm = function(message, defaultResponse){
    sendMsg('page', 'confirm', message, defaultResponse);
  }


  // Taken from mocha-phantomjs
  function isFileReady(readyState) {
    // Check to see if any of the ways a file can be ready are available as properties on the file's element
    return (!readyState || readyState == 'loaded' || readyState == 'complete' || readyState == 'uninitialized')
  }

  Object.defineProperty(window, 'initMochatron', {
    value: function () {
      console.format = util.format;
      var mocha = window.mocha;
      // Mocha needs a process.stdout.write in order to change the cursor position.
      Mocha.process = Mocha.process || {}
      Mocha.process.stdout = Mocha.process.stdout || process.stdout
      Mocha.process.stdout.write = function(s) { sendMsg('mocha', 'stdout', s) }

      var origRun = mocha.run, origUi = mocha.ui
      mocha.ui = function() {
        var retval = origUi.apply(mocha, arguments)
        configureMocha(config);
        // sendMsg('mocha', 'configureMocha', { configureMocha: mocha })
        mocha.reporter = function() {}
        return retval
      }
      mocha.run = function() {
        sendMsg('mocha', 'testRunStarted', mocha.suite.suites.length)
        mocha.runner = origRun.apply(mocha, [].concat(doneCallback, arguments))
        if (mocha.runner.stats && mocha.runner.stats.end) {
          sendMsg('mocha', 'testRunEnded', mocha.runner)
        } else {
          mocha.runner.on('end', function() {
            sendMsg('mocha', 'testRunEnded', mocha.runner)
          })
        }
        return mocha.runner
      }

      delete window.initMochatron
    },
    configurable: true
  })

  Object.defineProperty(window, 'checkForMocha', {
    value: function() {
      var scriptTags = document.querySelectorAll('script');
      var mochaScript = Array.prototype.filter.call(scriptTags, function(s) {
        var src = s.getAttribute('src')
        return src && src.match(/mocha\.js$/)
      })[0]

      if (mochaScript) {
        mochaScript.onreadystatechange = mochaScript.onload = function () {
          if (isFileReady(mochaScript.readyState)) {
            window.initMochatron()
          }
        }
      }
    }
  })
})()
