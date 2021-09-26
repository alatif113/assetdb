// Project configuration.
// Project configuration.
module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: { 
            all_src : { 
              src : 'appserver/static/js/*.js', 
              dest : 'appserver/static/js/assetdb.all.min.js'
            } 
          }
    });

    // Load the plugin that provides the "uglify" task.
    grunt.loadNpmTasks('grunt-contrib-uglify');

    // Default task(s).
    grunt.registerTask('default', ['uglify']);

};