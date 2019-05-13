#!/700s/sys/bin/node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

var path = require('path')
var fs = require('fs')
var http_generic = require('./http_generic.node.js')
var log = require('./log.node.js')
var lockers = require('../lib/lockers.node.js')
var msg_io = module.parent.require('../lib/msg_io.node.js')
var http_io = module.parent.require('../lib/http_io.node.js')
var child_io = require('./child_io.node.js')(module)
var nodeHandler = module.parent.require('./node.node.js')

exports = module.exports = function (that) {
    var cio = that.cio
    if (!cio) throw new Error('no cio')
    if (!cio.shutdown) throw new Error('no cio.shutdown')
    var module = that.module
    return function (file, req, res, extra, ended) {
        nodeHandler(cio, req, {
            writeHead: function (status, headers) {
                for (var x in headers) {
                    res.setHeader(x, headers[x])
                }
            },
            write: function (data) { return res.write(data) },
            end: function (data) {
                if (data) res.write(data)
                if (ended)
                    ended()
                else
                    res.end()
                return this
            }
        }, path.isAbsolute(file) ? file : path.join(path.dirname(module.filename), file), {}, extra)
    }
}
