/**
 * Created by pbaio on 9/14/15.
 */

"use strict";

var gulp = require('gulp');
var mocha = require('gulp-mocha');

gulp.task('test', function () {
  return gulp.src('./test/test.js', { read: false })
    .pipe(mocha({ reporter: 'list' }));
});

gulp.task('default', ['test']);