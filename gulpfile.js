var gulp = require('gulp');
var htmlmin = require('gulp-htmlmin');
var jsmin = require('gulp-jsmin');
var rename = require('gulp-rename');
var imagemin = require('gulp-imagemin');
var tinypng = require('gulp-tinypng-compress');
var tiny = require('gulp-tinypng-nokey');
var pngquant = require('imagemin-pngquant');
var csso = require('gulp-csso');
var root = "./";
var buildDir = root;
var datas = {
    html: [root + "/**/**/*.html", '!node_modules/**', '!.idea/**', '!themes/**'],
    image: [root + "/**/*.{png,jpg,jpeg}", '!node_modules/**', '!themes/**'],
    css: [root + "/**/*.css", '!node_modules/**', '!themes/**'],
    js: [root + "/**/*.js", '!*min.js', '!node_modules/**', '!themes/**', '!gulpfile.js']
}
gulp.task("htmlmin", function () {
    gulp.src(datas.html).pipe(htmlmin({
        collapseWhitespace: true,
        minifyJS: true,
        minifyCSS: true,
        removeComments: true
    })).pipe(gulp.dest(buildDir));
});

gulp.task("imagemin", function () {
    gulp.src(datas.image).pipe(imagemin({
        progressive: true,
        svgoPlugins: [{removeViewBox: false}],
        use: [pngquant()]
    })).pipe(gulp.dest(buildDir));
});

gulp.task("tinypng", function () {
    gulp.src(datas.image).pipe(tinypng({
        key: 'Wfz4fyNBcSJQErzUiVcski2K6mt3_KvO',
        sigFile: './images/.tinypng-sigs',
        log: true
    })).pipe(gulp.dest(buildDir));
});

gulp.task("tiny", function () {
    gulp.src(datas.image)
        .pipe(tiny())
        .pipe(gulp.dest(buildDir));
});

gulp.task("jsmin", function () {
    gulp.src(datas.js).pipe(jsmin()).pipe(gulp.dest(buildDir));
});

gulp.task("cssmin", function () {
    gulp.src(datas.css).pipe(csso()).pipe(gulp.dest(buildDir));
});

gulp.task("default", ["htmlmin", "imagemin", "jsmin", "cssmin"]);

// gulp.task("default", ["htmlmin", "jsmin", "cssmin"]);
//gulp.task("default", ["tinypng"]);
// gulp.task("default", ["tiny"]);

//gulp.task("default", ["imagemin", "jsmin"]); // TODO htmlmin 报错
// gulp.task("default", ["htmlmin", "jsmin"]);