#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

var log = require('./log.node.js')
var http_generic = require('./http_generic.node.js')

exports.extend = function (cio) {
    cio.http_request = function (req, res, extra) {
        if (!cio.linked.emit('http_request', req, res, extra || {})) {
            log.warn(new Error('HTTP 500 because no listener for cio\'s http_request event: ' + cio.linkedName))
            http_generic(req, res, 500)
        }
    }
}
