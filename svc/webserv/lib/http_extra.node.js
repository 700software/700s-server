#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

var util = require('util')
var url = require('url')
var path = require('path')
var net = require('net')
var http_generic = require('./http_generic.node.js')
var log = require('./log.node.js')
var secret = '/' + Math.random()

exports = module.exports = extras
exports.sanitize = sanitize
exports.logging = logging

function logging(o) { // clean up logging object
    if (typeof o != 'object') throw new Error('invalid logging')
    if (o.log_inc == null)
        if (typeof o.req == 'object') {
            o.log_inc = o.req.log_inc
        } else throw new Error('must supply either req or req.log_inc')
    if (!o.stamp) o.stamp = new Date().getTime()
    if (!o.pid) o.pid = process.pid
    if (!o.pname) o.pname = log.title
    if (o.text && o.text.stack) o.text = o.text.stack
    if (o.req) delete o.req
    return o
}

function sanitize(req, res, callback) { // only on listener receive of request

    if (!req.stamp) req.stamp = new Date().getTime()

    var o = url.parse(req.url)
    req.search = o.search || ''

    if (o.pathname.indexOf('%2f') != -1 || o.pathname.indexOf('%2F') != -1) { // replace %2f with / for consistant relative URLS in HTML
        res.writeHead(307, { 'Location': req.protocol + '://' + req.headers.host + o.pathname.replace(/(?:\/|%2[fF])+/g, '/') + req.search }) // replaces multiple / or any %2f with a single / (normalization of ../ is handled below (as well as normalizing // when %2f is not present))
        res.end()
        return false
    }

    req.context = ''

    try {
        req.path = decodeURIComponent(o.pathname) // Decode the URI (spaces are %20, etc)
    } catch(e) {
        http_generic(req, res, 400)
        return false
    }

    req.path = encodeURIComponent(req.path)  // Encode it again to take care of things like NUL character attacks

    req.path = req.path.replace(/%2f|%5c/ig, '/') // slashes are slashes
    req.path = req.path.replace(/%20/ig, ' ').replace(/%2c/ig, ',').replace(/%2b/ig, '+') // ok characters
    // other characters are not yet known to be supported or safe on the filesystem, so they remain encoded. Also %25 remains encoded.

    // it's important not to un-encode anything that the browser will re-encode automatically
    // it's also important that file-system unsafe characters (e.g. NUL and control characters) always get encoded.

    var host = req.headers.host

    if (!host) {
        http_generic(req, res, 404, 'Missing Host header!')
        return
    }
    
    host = host.replace(/\.+$/, '')
    
    if (host.length > 255 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::(?!0)\d{1,5})?$/.test(host)) {
        // the only thing it doesn't check as far as validity goes is that there is a max of 63 chars between dots. See stackoverflow.com/a/1133454
        http_generic(req, res, 404, 'Host header not valid!')
        return
    }
    
    if (path.join(secret, req.path).substring(0, secret.length) != secret) { // when path traversal is attempted
        http_generic(req, res, 400, 'Hey. Stop that.')
        return
    }

    var pathO = req.path

    req.path = path.join('/', req.path) // normalize ../ ./ and // (remove extra slashes for consistent relative URLS in HTML)

    req.host = req.headers.host

    req.ip = req.connection.remoteAddress

    req.protocol = req.connection.encrypted ? 'https' : 'http'

    req.pi = req.path

    req.res = res

    if (req.path != pathO || req.headers.host != host) {
        res.writeHead(308, { 'Location': req.protocol + '://' + host + req.path + req.search })
        res.end()
    } else
        callback(req, res)

}

function extras(req, res, callback) { // after deserialize via http_io
    var o = url.parse(req.url)
    req.search = o.search || ''
    req.host = req.headers.host
    req.ip = req.connection.remoteAddress
    req.protocol = req.connection.encrypted ? 'https' : 'http'
    callback(req, res)
}

