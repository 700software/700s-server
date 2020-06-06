#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

//##
//# Serves static files, automatic content-type determination, and support for cache.
//##
//# Usage:
//#
//# var static = module.parent.require('../lib/static.node.js')
//#
//# static(req, res, file, options) // serves the file as static content
//#
//# options.stats: Provide the fs.stats if you already have it. If not provided, fs.stat will be queried on the file.
//#     The only field that is used from this is mtime and size. You can provide a custom mtime if desirable, but size must match what is on the disk for a succesful download.
//#
//# options.name: provide the file name, to be passed through Content-Disposition.
//#     The file name extension is used to determine the Content-Type unless res.setHeader('Content-Type',...) was already used.
//#     If not set, the actual file's name is used.
//#
//# options.qscache: indicates what type of cache, if any to be automatically set to the Cache-Control header if a query string was present in the request url.
//#     Special values 'private' or 'public' indicates permanent (max-age=99999999) cache. Any other qscache string (i.e. 'private, max-age=86400') will be taken literally.
//#
//#     When there is no query string, 'no-cache' will be used regardless of what was provided in qscache.
//#     'no-cache' actually allows caching, and is equivalent to max-age=0, must-revalidate.
//#     If we did not pass any Cache-Control header, the browser would stop revalidating after some continuous use, which causes problems unless they reload the page.
//#
//#     Use res.setHeader('Cache-Control',...) to set headers regardless of query string (i.e. 'no-cache, no-store')
//#
//# options.download: set to true if the file should be downloaded to the visitor's computer.
//#     If not set, will attempt to display the file in the browser window instead.
//#
//# options.trusted: set to true if the content is part of the site. Necessary to allow HTML pages to be displayed instead of downloaded.
//#         If not set, then potentially unsafe content (i.e. HTML can be used to initiate XSS attack) will always be downloaded instead of run in the browser window.
//##

exports = module.exports = main

//# what mime types to serve for various file extensions
exports.ctypes = {
    'htm': 'text/html',
    'html': 'text/html',
    'txt': 'text/plain',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'json': 'application/json',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'css': 'text/css',
    'js': 'text/javascript',
    'pdf': 'application/pdf',
    'apk': 'application/vnd.android.package-archive',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'ico': 'image/x-icon',
    'svg': 'image/svg+xml',
}

//# what mime types are incapable of triggering XSS when viewed directly, used to show untrusted content to the screen (i.e. pdf and images), can provide file download otherwise (i.e. html files)
exports.safeToRender = {
    'image/png': true,
    'image/gif': true,
    'image/jpeg': true,
    'text/css': true,
    'text/javascript': true,
    'text/plain': true,
    'application/pdf': true,
    'image/x-icon': true,
    'image/svg+xml': true,
}

//##

var fs = require('fs')
var http_generic = require('./http_generic.node.js')
var log = require('./log.node.js')


function main(req, res, file, o) {

    if (req.method != 'GET' && req.method != 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD')
        http_generic(req, res, 405)
        return
    }

    if(o.stats)
        onstats()
    else
        fs.stat(file, function (err, stats) {
            if(err) {
                if(err.code == 'ENOENT') {
                    http_generic(req, res, 404)
                } else {
                    http_generic(req, res, 500)
                }
            } else {
                o.stats = stats
                onstats()
            }
        })
    function onstats() {

        if(!o.name)
            o.name = file.substring(file.lastIndexOf('/') + 1)

        if(!res.getHeader('Content-Type')) {
            var ext = (o.name.match(/\.(\w+)$/) || {})[1] || ''
            var ctype = exports.ctypes[ext.toLowerCase()] || 'application/octet-stream' // choose content-type based on file extension
            if(ctype.substring(0, 5) == 'text/') ctype += '; charset=UTF-8'
            res.setHeader('Content-Type', ctype)
        }

        if(o.qscache && req.search)
            res.setHeader('Cache-Control', o.qscache == 'private' || o.qscache == 'public' ? o.qscache + ', max-age=99999999' : o.qscache)
        if(!res.getHeader('Cache-Control'))
            res.setHeader('Cache-Control', 'no-cache')

        if(!res.getHeader('Etag')) res.setHeader('Etag', '"' + o.stats.mtime.getTime() + '"') // more specific, preference for deciding HTTP 304 vs 200
        if(!res.getHeader('Last-Modified')) res.setHeader('Last-Modified', o.stats.mtime.toGMTString()) // informational for the browser

        if(!res.getHeader('Content-Disposition')) {
            var nameAscii = o.name.replace(/"/g, "''").replace(/[^\x20-\x7e]/g, ' ')
            var namestuff = '; filename="' + nameAscii + '"'
            if(nameAscii != o.name) namestuff += "; filename*=UTF-8''" + encodeURIComponent(o.name)
            res.setHeader('Content-Disposition',
                (o.download ? 'attachment' : o.trusted ? 'inline'
                : exports.safeToRender[res.getHeader('Content-Type').replace(/;.*/, '').trim()] ? 'inline' : 'download') + namestuff)
        }

        if(req.headers['if-none-matched'] == res.getHeader('Etag') // check Etag first
                || req.headers['if-modified-since'] == res.getHeader('Last-Modified') && !('if-none-matched' in req.headers)) { // check Last-Modified if user-agent doesn't support Etag

            res.removeHeader('Content-Type')
            res.removeHeader('Content-Disposition')
            // res.removeHeader('Cache-Control')
            res.removeHeader('Last-Modified')
            // don't remove Etag
            res.statusCode = 304
            res.end()

        } else {
        
            var length = o.stats.size

            res.setHeader('Content-Length', length)
            res.setHeader('Accept-Ranges', 'bytes')
                
            var ranges = []
        
            ranging:
            if (req.headers['range'] != null) {

                var match = req.headers['range'].match(/^bytes=((?=-?\d)(?!0\d)\d*-(?!0\d)\d*(?:,(?=-?\d)(?!0\d)\d*-(?!0\d)\d*)*)$/) // verifies no octal digit notation, and at least one number on each side of the hyphen. can be comma separated (though that's not supported yet)
                if (!match) {
                    say416(res)
                    return
                }
                
                if (req.headers['if-range'] != null && req.headers['if-range'] != res.getHeader('Etag')) {
                    // note: the Java implementation I was following acknowledged the possibility that If-Range could be a date header (similar to if-modified-since?)
                    // I'm not following up on that condition because I don't think modern browsers would do it this way anymore.
                    
                    break ranging
                    
                }
                
                var rangeStrings = match[1].split(',')
                for (var i = 0; i < rangeStrings.length; i++) {
                    var range = rangeStrings[i].split('-')
                    if (range[0] == '') {
                        ranges.push([ length - range[1]*1, length - 1 ])
                    } else {
                        var start = range[0]*1
                        var end = range[1] == '' ? length - 1 : range[1]*1
                        if (end > length - 1) end = length - 1
                        if (start > end) {
                            say416(res)
                            return
                        }
                        ranges.push([ start, end ])
                    }
                }
            }
            
            if (ranges.length == 0)
                ranges.push([ 0, length - 1 ])
            
            if (ranges.length > 1)
                ranges.length == 1 // because we do not yet support multipart/byteranges
                
            var range = ranges[0]
            
            if (range[0] != 0 || range[1] != length - 1)
                res.statusCode = 206 // partial response
            
            if (res.statusCode == 206) {
                res.setHeader('Content-Range', 'bytes ' + range[0] + '-' + range[1] + '/' + length) 
                res.setHeader('Content-Length', range[0] - range[1] + 1) // shorter Content-Length needed for iPad to represent audio seekable correctly
            }
            
            if (range[0] > range[1]) {
                res.end()
            } else {
                var stream = fs.createReadStream(file, { start: range[0], end: range[1] })
                req.on('close', function () {
                    stream.destroy() // prevents stuck-open file descriptor when download is interrupted
                })
                stream.pipe(res)
            }
            
        }
        
        function say416(res) {
            res.removeHeader('Content-Disposition')
            res.removeHeader('Content-Type')
            res.removeHeader('Content-Length')
            res.removeHeader('Cache-Control')
            res.removeHeader('Etag')
            res.removeHeader('Last-Modified')
            res.removeHeader('Accept-Ranges')
            res.statusCode = 416 // range not satisfiable
            res.setHeader('Content-Range', 'bytes */' + length) // required for 416
            res.end()
        }

    }
    
}
