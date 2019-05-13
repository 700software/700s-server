#!/700s/sys/bin/node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

// Usage:
// var route = module.parent.require('./route.node.js')
// route.cio = this.cio

// route(docroot, req, res, options)

// options.directoryTrailingSlash = true or false, or null (to leave as-is)

// default options set in dispatcher.node.js.

// can be overridden with ,.node.js

// If any of these file/directory names are found in the path, 404 is returned regardless of whether they exist in the docroot.
var mask_404 = [ 'WEB-INF', 'META-INF' ]
// (anything that starts with . returns 404 automatically)


var static_exts = [
    '.txt', '.css', '.js',
    '.apk',
    '.ico',
    '.png', '.gif', '.jpg', '.jpeg', '.bmp',
    '.mp4',
    '.woff', '.woff2', '.ttf', 'ttc', 'otf', '.eot',
    '.webmanifest',
    '.xml',
    '.svg',
    '.pdf',
    // also consider adding mime type to static.node.js exports.ctypes, or else it will default to application/octet-stream
]



var auto_exts = [ '.html', '.node.js', '.json' ]

//##

var util = require('util')
var fs = require('fs')
var path = require('path')
var log = module.parent.require('../lib/log.node.js')
var msg_io = module.parent.require('../lib/msg_io.node.js')
var http_io = module.parent.require('../lib/http_io.node.js')
var lockers = require('../lib/lockers.node.js')
var child_io = module.parent.exports(module)

// preload modules befre downgrade
var http_generic = module.parent.require('./http_generic.node.js')
var staticHandler = module.parent.require('../lib/static.node.js') 

var shutdown = false
var modules = {}
var modules_locker = lockers()

exports = module.exports = function (cio) {

    cio.on('shutdown', function () {
        // indicates shutdown has been initiated and resources should be freed
        // there may be one or two more requests that come in in which case resources would need to be reallocated and then freed up again
        shutdown = true
        var keys = Object.keys(modules) 
        for (var i = 0; i < keys.length; i++) {
            modules[keys[i]].cio.shutdown()
            delete modules[keys[i]]
        }
    })
            
    return route
    function route(docrootBegin, req, res, options) {
    
        if (!options) options = { }
    
        proceed(docrootBegin, req.pi)
        
        function proceed(docr, path) {
    
            // get first filename in path
            var next = ''
            var match = path.match(/^\/[^\/]+/)
            if (match) {
                path = path.substring(match.index + match[0].length) // same as path = path.replace(/^\/[^\/]+/, '')
                next = match[0]
                if (next == '/.' || next == '/..') {
                    http_generic(req, res, 403)
                    return
                }
                for (var i = 0; i < mask_404.length; i++)
                    if (next == '/' + mask_404[i]) {
                        if (options.onNotFound)
                            if (options.onNotFound() == false)
                                return
                        http_generic(req, res, 404)
                        return
                    }
            }
            
            tryFilter()
            
            function tryFilter() {
                if (docr != docrootBegin) {
                    var pathToFilter = docr + '/,.node.js'
                    fs.stat(pathToFilter, function (err, stats) {
                        if(err) {
                            if(err.code == 'ENOENT') {
                                tryFiles()
                            } else {
                                http_generic(req, res, 500)
                            }
                        } else {
                            if(stats.isDirectory()) {
                                if (options.onNotFound)
                                    if (options.onNotFound() == false)
                                        return
                                http_generic(req, res, 404)
                            } else
                                proceedNode(pathToFilter, stats, next + path)
                        }
                    })
                } else
                    tryFiles()
            }
            
            function tryFiles() {
            
                var tried = []
                
                var exts = [ ]
                if (next)
                    exts.push('')
                if (next != '/index' && next != '/,') // index.html would be available without literally typing index in the address bar; and ,.node.js is a filter, not to be accessed directly.
                    exts.push.apply(exts, auto_exts)
                if (!next)
                    next = '/index'
                
                tryit()
                    
                function tryit() {
                    var ext = exts.shift()
                    if(ext != null) {
                        fs.stat(docr + next + ext, function (err, stats) {
                            if(err) {
                                if(err.code == 'ENOENT') {
                                    tried.push(next.substring(1) + ext)
                                    tryit()
                                } else {
                                    http_generic(req, res, 500)
                                }
                            } else {
                                if(stats.isDirectory()) {
                                    if(ext) {
                                        if (options.onNotFound)
                                            if (options.onNotFound() == false)
                                                return
                                        http_generic(req, res, 404)
                                    } else
                                        proceed(docr + next + ext, path)
                                } else
                                    if(ext) {
                                        if(ext == '.html') {
                                            proceedStatic(docr + next + ext, stats, path)
                                        } else if(ext == '.node.js') {
                                            proceedNode(docr + next + ext, stats, path)
                                        } else {
                                            proceedStatic(docr + next + ext, stats, path)
                                        }
                                    } else {
                                        outer: for (var i = 0; i < static_exts.length; i++)
                                            if (endsWith(next, static_exts[i])) { // finds things like .js, .ico
                                                for (var i = 0; i < auto_exts.length; i++)
                                                    if (endsWith(next, auto_exts[i])) // finds .node.js
                                                        break outer // prevents viewing source code which is what you normally would get for .js
                                                proceedStatic(docr + next + ext, stats, path)
                                                return
                                            }
                                            
                                        for (var i = 0; i < auto_exts.length; i++)
                                            if (next == '/index' + auto_exts[i]) {
                                                if (options.onNotFound)
                                                    if (options.onNotFound() == false)
                                                        return
                                                http_generic(req, res, 404)
                                                return
                                            }
                                            
                                        if (options.onNotFound)
                                            if (options.onNotFound() == false)
                                                return
                                        http_generic(req, res, 404)
                                    }
                            }
                        })
                    } else {
                        if (options.onNotFound)
                            if (options.onNotFound() == false)
                                return 
                        http_generic(req, res, 404)
                    }
                }
                
            }
        }
        
        function proceedNode(file, stats, path) {
            req.context += req.pi.substring(0, req.pi.length - path.length)
            req.pi = path
            var modified = stats.mtime.getTime()
            if(modules[file] && !modules[file].cio.ok)
                modules[file] = null
            if(modules[file] && modules[file].modified == modified) // if module is already loaded
                goahead(modules[file])
            else
                loadit()
            function loadit() {
                modules_locker.lock(file, function () {
                    fs.stat(file, function (err, stats) { // check stats again in case there was some delay obtaining lock
                        if (err) {
                            http_generic(req, res, 503)
                            modules_locker.unlock(file)
                        } else {
                            var modified = stats.mtime.getTime()
                            if(modules[file] && !modules[file].cio.ok)
                                modules[file] = null
                            if(modules[file] && modules[file].modified == modified) { // if module is now loaded
                                goahead(modules[file])
                                modules_locker.unlock(file)
                            } else {
                                var sleep = modified + (modified % 1000 == 0 ? 1000 : 1) - new Date().getTime() // for 1 second precision, sleep to end of second before read. for 1ms precision, sleep to end of ms.
                                if(sleep > 0)
                                    setTimeout(slept, sleep)
                                else
                                    slept()
                            }
                        }
                        function slept() {
                            if (modules[file]) {
                                modules[file].cio.shutdown()
                                delete modules[file]
                            }
                            child_io.launch(file, file.replace(/.*\//, ''))
                        }
                    })
                })
            }
            function goahead(x) {
                x.cio.http_request(req, res)
            }
        }
        
        function proceedStatic(file, stats, path) {
            if(!endsWith(file, '.html') && !endsWith(file, '.json'))
                for(var i = 0; i < auto_exts.length; i++)
                    if(endsWith(file, auto_exts[i])) {
                        if (options.onNotFound)
                            if (options.onNotFound() == false)
                                return
                        http_generic(req, res, 404)
                        return
                    }
            
            if(path) {
                if(path == '/') {
                    if(path.length < req.path.length // as in, can't strip trailing slash from top level anyway
                            && options.directoryTrailingSlash == false && file.endsWith('/index.html')) {
                        res.writeHead(301, { 'Location': req.protocol + '://' + req.headers.host + req.path.substring(0, req.path.length - path.length) + req.search })
                        res.end()
                        return
                    }
                } else {
                    if (options.onNotFound)
                        if (options.onNotFound() == false)
                            return
                    http_generic(req, res, 404)
                    return
                }
            } else if(options.directoryTrailingSlash == true && file.endsWith('/index.html')) {
                res.writeHead(301, { 'Location': req.protocol + '://' + req.headers.host + req.path + '/' + req.search })
                res.end()
                return
            }
            
                    
            if (options.onStaticFound)
                if (options.onStaticFound(file) == false)
                    return
            
            staticHandler(req, res, file, { stats: stats, trusted: true })
            
        }
        
    }
}


function endsWith(s, x) {
    return s.substring(s.length - x.length) == x
}

