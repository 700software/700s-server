#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

//##
//# HTTP error pages. Tries /700s/web/,generics/http-err.node.js first.
//# This file has a plain-text boring backup in case /700s/web is not accessible.
//##
//
var location = '/700s/web/,generic/http-err.node.js'
//
//##

var log = module.parent.require('../lib/log.node.js')
var http = require('http')
var http_generic
var http_generic_generic = function (req, res, statusCode, statusReason) { // to be self reliant
    res.writeHead(statusCode, statusReason)
    res.end(statusCode + ' ' + (statusReason || http.STATUS_CODES[statusCode]))
}
var last = null

module.exports = function () {
    if(!http_generic)
        try {
            http_generic = require(location)
        } catch (err) { // doesn't exist, syntax error, etc
            if(err.stack != last) {
                log.err((last ? 'Still cannot' : 'Could not') + ' load ' + location + '. Using plain-text backup error pages instead.\n ' + err.stack)
                last = err.stack
            }
            http_generic_generic.apply(this, arguments)
            return
        }
    if(last) {
        log.rotation('error page module loaded now')
        last = null
    }
    http_generic.apply(this, arguments)
}
