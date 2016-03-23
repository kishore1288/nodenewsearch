// lib/sme.js

"use strict";

// Modules ================================================
var async = require('async');
var Promise = require('bluebird');
var colors = require('colors');
var config = require('config');
var convert = require('../lib/utils/convert.js');
var fs = require('fs');
var logger = require('./utils/logger.js');
var moment = require('moment');
var os = require('os');
var request = require('request');
var rp = require('request-promise');
var us = require('underscore');
var SmeSc = require('./sme-searchcriteria');

var xmlParser = Promise.promisifyAll(require('xml2js').Parser({ trim: true, explicitArray: false }));

var smeConfig = config.get('StorageMadeEasy');
console.log(smeConfig);

colors.setTheme({
  sme: 'cyan',
  smeResult: 'magenta',
  socket: 'green',
  error: 'red'
});

var smeAddress = {
  hostname: smeConfig.SMEInstance.hostname
};

var metanames = {};

module.exports = {
  // Attempts to Retrieve the PDF Annotator URL for a given file.
  // token - SME Token to execute API request with
  // fileId - ID of file to generate Annotator URL for
  // callback - callback function
  // returns - PDF Annotator URL for the given file if valid
  getFileAnnotator: function (token, fileId, groupId) {
    console.log('Inside file annotator');

    var requestOpts = {
      method: 'GET',
      url: smeAddress.hostname,
      qs: {
        token: token,
        'function': 'getDocumentAnnotationsUrl',
        fi_id: fileId,
        gr_id: groupId || 0
      },
      timeout: smeConfig.requestTimeout,
      pool: false
    };

    return rp(requestOpts)
      .then(function (body) {
        return xmlParser.parseStringAsync(body);
      })
      .then(function (json) {
        if (json.response.status === 'ok') {
          var splitUrl = json.response.url.split(':', 2);
          var protocol = smeConfig.resultUrlProtocol || 'https';

          return Promise.resolve(protocol + ':' + splitUrl[1]);
        }
        else
          return Promise.resolve('');
      })
      .catch(function (err) {
        console.log(requestOpts);
        console.log(err);
        throw new Error(err);
      });
  },

  // Gets a URL from SME where the file specified by fileId could be downloaded from
  // token - SME TOken to execute API request with
  // fileId - ID of file to get download URL for
  // callback - function to call with results when finished with
  getFileDownloadUrl: function (token, fileId) {
    console.log('Inside Download File');

    var requestOpts = {
      method: 'GET',
      uri: smeAddress.hostname,
      qs: {
        token: token,
        'function': 'getFileURL',
        fi_id: fileId,
        days: 0,
        hours: 0,
        minutes: 0,
        password: '',
        shorturl: 'y',
        options: '',
        downloadlimit: 0
      },
      timeout: smeConfig.requestTimeout,
      pool: false
    };

    return rp(requestOpts)
      .then(function(body) {
        return xmlParser.parseStringAsync(body);
      })
      .then(function(json) {
        if (json.response.status === 'ok') {
          var splitUrl = json.response.url.split(':', 2);
          var protocol = smeConfig.resultUrlProtocol || 'https';

          return Promise.resolve(protocol + ':' + splitUrl[1]);
        }
        else
          return Promise.resolve('');
      })

      .catch(function(err) {
        throw new Error(err);
      });

  },

  // Gets SME File Metadata for a particular fileId
  // token - SME API Token
  // fileId - File to get Metadata for
  // callback - function to call with results when finished
  // returns - object of metadata for the file
  getFileMetadata: function (token, fileId) {
    console.log('inside file metadata');

    var needMnames = us.keys(metanames).length === 0;
    var requestOpts = {
      method: 'GET',
      uri: smeAddress.hostname,
      qs: {
        token: token,
        'function': 'getFilemetadata',
        fi_id: fileId,
        metanames: needMnames ? 'y' : 'n',
        timeout: smeConfig.requestTimeout,
        pool: false
      }
    };

    return rp(requestOpts)
      .then(function(body) {
        return xmlParser.parseStringAsync(body);
      })
      .then(function(json) {
        if (json.response.status === 'ok') {
          if (typeof json.response.metadata === 'object') {
            if (needMnames && !us.isEmpty(json.response.metanames)) {
              us.each(us.keys(json.response.metanames), function (mname) {
                var nameObj = json.response.metanames[mname];
                metanames[nameObj.txn_id] = nameObj.txn_title;
              });
              console.log(metanames);
            }

            var metadata = {};
            return Promise.map(us.keys(json.response.metadata), function (mdata) {
              var meta = json.response.metadata[mdata];
              console.log(metanames[meta.txn_metaid]);
              metadata[metanames[meta.txn_metaid]] = json.response.metadata[mdata].txn_value;
            })
              .then(function () {
                console.log(metadata);
                return Promise.resolve(metadata);
              });
          }
          return Promise.resolve({});
        }
        else
          throw new Error(json.response.statusmessage);
      })
      .catch(function(err) {
        throw err;
      });
  },

  // Gets the Non-Metadata Tags present on all files that a user has
  // token - SME token to use during SME request
  // socket - The socket to use
  getTags: function (token) {
    var tags = [];

    var requestOpts = {
      method: 'GET',
      uri: smeAddress.hostname,
      qs: {
        token: token,
        'function': 'getAllTags',
        metaid: 0,
        mergemetadata: 'y'
      },
      timeout: smeConfig.requestTimeout,
      pool: false
    };

    return rp(requestOpts)
      .then(function(body) {
        return xmlParser.parseStringAsync(body);
      })
      .then(function(json) {
        console.log(json);
        if (json.response.status === 'ok') {
          return Promise.map(us.keys(json.response.tagslist), function(key) {
            var tag = json.response.tagslist[key];

            if (tag.ta_metaid === '0') {
              tags.push({
                Tag: tag.ta_name,
                Count: convert.toInt(tag.occerences)
              })
            }
          }, { concurrency: 4 })
        }
        else
          return Promise.reject(json.response.statusmessage);
      })
      .then(function() {
        return Promise.resolve(tags);
      })
      .catch(function(err) {
        throw err;
      });
  },

  getToken: function (data) {
    var requestOpts = {
      method: smeConfig.TokenGenerator.method,
      uri: smeConfig.TokenGenerator.hostname
      + smeConfig.TokenGenerator.path + encodeURIComponent(data.Username),
      timeout: smeConfig.requestTimeout
    };

    console.log(requestOpts);

    return rp(requestOpts)
      .then(function (body) {
        var tokenJson = JSON.parse(body);
        console.log(tokenJson);
        return tokenJson.Status === 'ok' ? tokenJson.ApiToken : '';
      })
      .catch(function (err) {
        console.log(err.message);
        throw new Error(err);
      });
  },

  search: function (token, filterData) {
    console.log('inside search');
    console.log('Token: ' + token);
    var searchTypes = ['v', 'a', 'o', 'h', 's', 'd', 'e', 'x', 'c', 'n'];
    var textOptions = ['x', 'wh', 'bw', 'ew', 'wx'];

    var requestOpts = {
      method: 'GET',
      uri: smeAddress.hostname,
      resolveWithFullResponse: true,
      timeout: smeConfig.requestTimeout
    };

    // Initialize Filter Types
    var filenameFilter = false;
    var descriptionFilter = false;
    var extensionFilter = false;
    var tagFilter = false;
    var metadataFilter = false;
    var fromDateFilter = false;
    var toDateFilter = false;

    // Establish which filters need to be used
    // Filename Filter
    if (us.has(filterData, 'Filename') && !us.isUndefined(filterData.Filename.trim()))
      filenameFilter = true;

    // File Description Filter
    if (us.has(filterData, 'Description') && !us.isUndefined(filterData.Description.trim()))
      descriptionFilter = true;

    // File Extension Filter
    if (us.has(filterData, 'Extensions') && us.isArray(filterData.Extensions) && !us.isEmpty(filterData.Extensions))
      extensionFilter = true;

    // File Tag Filter
    if (us.has(filterData, 'Tags') && us.isArray(filterData.Tags) && !us.isEmpty(filterData.Tags))
      tagFilter = true;

    // File Metadata Filter
    if (us.has(filterData, 'Metadata') && us.isArray(filterData.Metadata) && !us.isEmpty(filterData.Metadata))
      metadataFilter = true;

    // File Modification From Date Filter
    if (us.has(filterData, 'FromDate') && us.isDate(new Date(filterData.FromDate)))
      fromDateFilter = true;

    // File Modification To Date Filter
    if (us.has(filterData, 'ToDate') && us.isDate(new Date(filterData.ToDate)))
      toDateFilter = true;

    /*
     * This next section is where we will determine whether or not the parameters passed
     * along with the filters they are using are correct, if they are not correct
     * we will emit a 'search-failure' event to the end user. If the request passes this
     * set of checks we will proceed with formatting the request to SME and retrieval
     * of the search results.
     */
    // Ensure that we received a folder to search in, if we didn't or the folder value is invalid return an error back over the socket.
    if (!us.has(filterData, 'FolderId') || filterData.FolderId < 0)
      return new Error('folderId must be set to a value greater than or equal to 0');
    // There must be a Type of search specified
    else if (!us.has(filterData, 'Type'))
      return new Error('type parameter must be set');
    // Doing a Metadata search requires a MetaClause be set.
    else if (metadataFilter && !us.has(filterData, 'MetaClause'))
      return new Error('running a metadata search requires the MetaClause parameter be passed with a value.');
    else if (us.has(filterData.TextOption) && !us.contains(['v', 'h'], filterData.Type.toLowerCase()))
      return new Error('when using TextOption param, Type must be set to either "v" or "h"');
    // Ensure that we received at least form of search criteria
    // If none of our filters are enabled then we aren't searching for anything
    else if (!filenameFilter && !descriptionFilter && !extensionFilter && !tagFilter && !metadataFilter && !fromDateFilter && !toDateFilter)
      return new Error('must provide at least one search criteria');

    // If we passed all of our checks then build the search URI and execute the search
    else {
      // Initialize our Query String Variables
      var mdCriteriaList = [];
      var metaclause = '';
      var type = '';
      var textOption = '';

      if (typeof filterData.Type === 'number') {
        switch (filterData.Type) {
          case 1:
            type = 'a';
            break;
          case 2:
            type = 'o';
            break;
          case 4:
            type = 's';
            break;
          case 5:
            type = 'd';
            break;
          default:
            type = 'v';
            break;
        }
      }
      else if (typeof filterData.Type === 'string') {
        if (us.contains(searchTypes, filterData.Type))
          type = filterData.Type;
        else
          type = 'v';
      }

      if (fromDateFilter)
        mdCriteriaList.push(
          new SmeSc(
            19,
            'm',
            moment(filterData.FromDate).format('YYYY-MM-DD'),
            'and'
          ).getCriteriaString()
        );

      if (toDateFilter)
        mdCriteriaList.push(
          new SmeSc(
            19,
            'l',
            moment(filterData.ToDate).format('YYYY-MM-DD'),
            'and'
          ).getCriteriaString()
        );

      // If the metadataFilter is true then we want to add a MetaClause
      if (metadataFilter || fromDateFilter || toDateFilter) {
        if (typeof filterData.MetaClause === 'number') {
          switch (filterData.MetaClause) {
            case 1:
              metaclause = 'and';
              break;
            case 2:
              metaclause = 'or';
              break;
            case undefined:
              metaclause = 'and';
              break;
            default:
              metaclause = 'and';
              break;
          }
        } else if (typeof filterData.MetaClause === 'string') {
          if (filterData.MetaClause === 'and' || filterData.MetaClause === 'or')
            metaclause = filterData.MetaClause;
          else
            metaclause = 'and';
        }
      }

      // TODO Make this use Promise.resolve().all()
      if (metadataFilter) {
        filterData.Metadata.forEach(function (mdCriteria) {
          // Add our SearchClause
          // If the value of SearchClause is anything other
          // than 'and'/'or' then default to 'and'
          var searchClause;
          if (typeof mdCriteria.SearchClause === 'number') {
            switch (mdCriteria.SearchClause) {
              case 2:
                searchClause = 2;
                break;
              default:
                searchClause = 1;
                break;
            }
          } else if (typeof mdCriteria.SearchClause === 'string') {
            if (mdCriteria.SearchClause.toLowerCase() === 'and'
              || mdCriteria.SearchClause.toLowerCase() === 'or')
              searchClause = mdCriteria.SearchClause;
            else
              searchClause = 'and';
          } else
            searchClause = 'and';

          // Add our TextClause
          // If the Value of SearchClause is anything other
          // than 'equals' or 'contains' then default to 'equals'
          var textClause;
          if (typeof mdCriteria.TextClause === 'number') {
            switch (mdCriteria.TextClause) {
              case 1:
                textClause = 1;
                break;
              default:
                textClause = 0;
                break;
            }
          }
          else if (typeof mdCriteria.TextClause === 'string') {

            var tcLower = mdCriteria.TextClause.toLowerCase();

            if (tcLower === 'x' || tcLower === 'c')
              textClause = tcLower;
            else if (tcLower === 'equals')
              textClause = 'x';
            else if (tcLower === 'contains')
              textClause = 'c';
            else
              textClause = 'x';

          } else
            textClause = 'x';

          var searchCriteria = new SmeSc(
            mdCriteria.Id,
            textClause,
            mdCriteria.Criteria,
            searchClause
          );

          mdCriteriaList.push(searchCriteria.getCriteriaString());
        });
      }

      // Build our TextOption string
      if (us.has(filterData, 'TextOption')) {
        if ((filterData.Type === 'v' || filterData.Type === 'h')) {
          var optString = '';

          for (var i = 0; i < filterData.TextOption.length; i++) {
            if (us.contains(textOptions, filterData.TextOption[i])) {
              if (optString.length > 0)
                optString += ';';
              optString += filterData.TextOption[i];
            }
          }

          textOption += optString;
        }
      }

      requestOpts.qs = {
        token: token,
        'function': 'getFilesByQuickFilter',
        fi_pid: filterData.FolderId,
        from: 0,
        count: '',
        fi_name: filenameFilter ? filterData.Filename : '',
        fi_extension: extensionFilter ? filterData.Extensions.join(',') : '',
        fi_description: descriptionFilter ? filterData.Description : '',
        fi_public: '',
        fi_provider: '',
        fi_encrypted: '',
        fi_structtype: '',
        fi_favorite: '',
        includefolders: type === 'v' ? 'y' : 'n',
        showpath: 'n',
        fi_tags: tagFilter ? filterData.Tags.join(',') : '',
        orderby: 'fi_name',
        includesubfolders: 'y',
        includeversions: 'n',
        sharingstatus: 'n',
        options: '',
        type: type,
        fromdate: '',
        todate: '',
        dateclause: '',
        metaclause: metaclause,
        metadata: mdCriteriaList.length ? mdCriteriaList.join(';') : '',
        textoption: textOption
      };

      console.log('Request Options: ' + JSON.stringify(requestOpts, null, 2));
      //console.log(('requestUri: ' + requestUri).bgCyan);
      return rp(requestOpts)
        .then(function (response) {
          logger.info(response.request.uri.href);
          return xmlParser.parseStringAsync(response.body);
        })
        .then(function (json) {
          //console.log(json);
          if (json.response.status === 'ok') {
            console.log(json.response.total);
            if (convert.toInt(json.response.total) > 0) {
              //console.log('inside if');
              return Promise.map(us.keys(json.response.filelist), function (file) {
                return Promise.resolve(json.response.filelist[file]);
              });
            }
            else
              return [];
          }
          else
            throw new Error(json.response.statusmessage);
        })
        .map(function (file) {
          return Promise.resolve({
            fileId: file.fi_id,
            folderId: file.fi_pid,
            userId: file.fi_uid,
            description: file.fi_description,
            extension: file.fi_extension,
            filename: file.fi_name,
            createdOn: new Date(file.fi_created),
            modifiedOn: new Date(file.fi_modified),
            matchedOn: file.matched.toString(),
            tags: file.fi_tags ? file.fi_tags.split(',') : []
          });
        })
        .then(function (results) {
          return Promise.filter(results, function(result) {
            if (smeConfig.sanitizeResultsMissingExtension)
              return Promise.resolve(result.extension ? true : false);
            else
              return Promise.resolve(true)
          });
        })
        .then(function(results) {
          console.log('Results Length: ' + results.length);
          return Promise.resolve(results);
        })
        .catch(function (err) {
          throw Error(err);
        });
    }
  }
};
