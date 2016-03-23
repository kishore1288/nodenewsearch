// app.js

"use strict";

// Modules ==========================================
var express = require('express');
var app = require('express')();
var colors = require('colors');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var async = require('async');
var os = require('os');
var us = require('underscore');
var helmet = require('helmet');
var logger = require('./lib/utils/logger.js');
var sme = require('./lib/sme.js');

var Promise = require('bluebird');
var config = require('config');
var concurrencyMultiplier = config.get('concurrencyMultiplier');

// If we are in a virtual directory from IIS we want to get it
var virtualDirPath = config.get('virtualDirPath') || '';

// Socket.io ==============================================
var http = require('http');
var server = require('http').Server(app);
var io = require('socket.io')(server, { path: virtualDirPath + '/socket.io' });

server.listen(process.env.PORT || 9091);

// Colors Setup ===========================================
colors.setTheme({
  sme: 'cyan',
  socket: 'green',
  error: 'red'
});

// Express Setup ==========================================
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

app.use(helmet());
app.use(express.static(path.join(virtualDirPath, 'public')));
app.use(require('morgan')('combined', { 'stream': logger.stream }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));

app.get(virtualDirPath + '/', function (req, res) {
  res.render('index', { deployPath: virtualDirPath });
});

app.get(virtualDirPath + '/docs', function (req, res) {
  res.render('docs', { deployPath: virtualDirPath });
});

app.get(virtualDirPath + '/doc-analysis', function (req, res) {
  res.render('doc-analysis', { deployPath: virtualDirPath });
});

app.get(virtualDirPath + '/direct-test', function (req, res) {
  res.render('direct-test', { deployPath: virtualDirPath });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


io.on('connection', function (socket) {
  console.log('new connected established\n'.socket + socket.socket);

  // Get Folders & Sub-Folders for a given directory that the given user has access to.
  socket.on('get-folders', function (data) {
    console.log('get-folders fired');
    // Ensure we received either a Token or a Username
    if (!us.has(data, 'Token') && !us.has(data, 'Username'))
      socket.emit('get-folders-failure', { error: 'Request data must contain a Token or Username' });
    else if (!us.has(data, 'FolderId') || data.FolderId < 0)
      socket.emit('get-folders-failure', { error: 'Request data must contain a FolderId' });
    else {
      /*
       * Waterfall Steps
       * Function 1: Get the Token for SME
       * Function 2: Get the folder list using the Token from Function 1.
       */
      async.waterfall([
        function (callback) {
          if (us.has(data, 'Username'))
            sme.getToken(data, callback);
          else if (us.has(data, 'Token'))
            return callback(null, data.Token);
          else
            return callback(new Error('A Username or Token must be provided'), '');
        },
        function (token, callback) {
          // sme.getFolderList is not finished, until then a default response containing
          // an array of just the root folder
          //sme.getFolderList(token, socket, data, callback);
          var folders = [];

          var rootFolder = {
            FolderId: 0,
            ParentFolderId: 0,
            FolderName: 'Root',
            Children: []
          };

          folders.push(rootFolder);

          socket.emit('get-folders-result', folders);

          return callback(null, '')

        }, function (err) {
          if (err) {
            socket.emit('get-folders-failure', { error: err.message });
            logger.error(err);
          }
        }
      ]);
    }
  });

  socket.on('get-tags', function (data) {
    // Log the Request Data
    logger.info(data);

    new Promise(function(resolve) {
      if (us.has(data, 'Username'))
        return resolve(sme.getToken(data));
      else if (us.has(data, 'Token'))
        return resolve(data.Token);
    })
      .then(function(token) {
        return sme.getTags(token);
      })
      .then(function(tags) {
        socket.emit('get-tags-result', { Tags: tags });
      })
      .catch(function(err) {
        logger.error(err);
        socket.emit('get-tags-failure', { error: err.message });
      });
  });

  socket.on('search', function (data) {
    var count = 1;
    console.log(('new search request on socket \ndata passed:' + JSON.stringify(data)).socket);
    logger.info(data);

    if (!us.has(data, 'Token') && !us.has(data, 'Username')) {
      socket.emit('search-failure', { error: 'Request data must contain a Token or Username' });
    }
    else {

      new Promise(function (resolve) {

        console.log(data);

        if (us.has(data, 'Username'))
          return resolve(sme.getToken(data));
        else if (us.has(data, 'Token'))
          return resolve(data.Token);
      })
        .then(function(token) {
          console.log('Before Search: ' + token);
          return sme.search(token, data)
            .map(function (file) {
              var annotatorUrl = file.extension === 'pdf' ? sme.getFileAnnotator(token, file.fileId, file.folderId) : '';
              var downloadUrl = file.extension ? sme.getFileDownloadUrl(token, file.fileId) : '';
              var metadata = file.extension ? sme.getFileMetadata(token, file.fileId) : {};

              return Promise.join(annotatorUrl, downloadUrl, metadata
                , function (annotatorUrl, downloadUrl, metadata) {
                  console.log('Count: ' + count++);
                  console.log(annotatorUrl);
                  console.log(downloadUrl);
                  console.log(metadata);
                  file.AnnotatorUrl = annotatorUrl;
                  file.DownloadUrl = downloadUrl;
                  file.Metadata = metadata;

                  socket.emit('search-result', file);
                })
                .catch(function (err) {
                  count++;
                  logger.error(err);
                  socket.emit('search-result', file);
                });
              }, {concurrency: os.cpus().length * concurrencyMultiplier }
            );
        })
        .then(function() {
          socket.emit('search-complete', { resultsReturned: count - 1});
        })
        .catch(function(err) {
          console.log('outermost catch');
          logger.error(err);
          socket.emit('search-failure', { err: err.message });
        });
    }
  });

  socket.on('open-annotator', function (data) {
    if (!us.has(data, 'Token') && !us.has(data, 'Username'))
      socket.emit('search-failure', { error: 'token must be set to a value' });
    else {
      async.waterfall([
        function (callback) {
          if (us.has(data, 'Username'))
            sme.getToken(data, callback);
          else if (us.has(data, 'Token'))
            return callback(null, data.Token);
          else
            return callback(new Error('A Username or Token must be provided'), '');
        }
        , function (token, callback) {
          if (token.length > 0)
            return callback(null, sme.search(token, socket, data));
          else
            socket.emit('search-failure', {
              status: 'error',
              statusMessage: 'failed to generate token for username ' + data.Username
            });
        }
      ], function (err) {
        if (err)
          socket.emit('search-failure', { status: 'error', statusMessage: err.message });
      });
    }
  });

  socket.on('disconnect', function (data) {
    console.log('a user disconnected'.socket);
  });
});
