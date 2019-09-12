#!/usr/bin/env node /700s/svc/webserv/lib/child_io.node.js
if (!this.cio) { console.error('Direct usage not permitted. Please use load using child_io.node.js'); process.exit(9) }

//##

var fs = require('fs')
var path = require('path')
var http_io = module.parent.require('../lib/http_io.node.js')

var http_generic = module.parent.require('./http_generic.node.js')
var route = module.parent.require('./route.node.js')

http_io.extend(cio)
cio.on('http_request', function (req, res) {
    
    // http_extra ensures no path traversal from this
    var domainRoot = req.listenerMultiDomain ? path.join(req.listenerDocroot, req.headers.host) : req.listenerDocroot
    fs.stat(domainRoot, function (err) {
        if (err) {
            if (err.code == 'ENOENT' && req.listenerMultiDomain) {
                var alt = req.headers.host.substring(0, 4) == 'www.' ? req.headers.host.substring(4) : 'www.' + domainRoot
                alt = alt.replace(/\.+$/, '')
                var altRoot = path.join(req.listenerDocroot, alt) // http_extra ensures no path traveral from this
                fs.stat(altRoot, function (err2) {
                    if (err2) {
                        http_generic(req, res, 404)
                    } else {
                        res.writeHead(301, { 'Location': req.protocol + '://' + alt + req.path + req.search })
                        res.end()
                    }
                })
            } else {
                http_generic(req, res, 500)
            }
        } else {
            // http_extra ensures req.headers.host is safe
            req.pi = '/' + path.basename(domainRoot) + req.pi
            // using the parent of domainRoot  as a starting point so that route's tryFilter will also work at the top level (domainRoot/,.node.js)
            route(path.dirname(domainRoot), req, res)
        }
        
    })
})

cio.on('shutdown', function () {
    process.emit('endd')
})

function endsWith(s, x) {
    return s.substring(s.length - x.length) == x
}

