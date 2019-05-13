#!/700s/sys/bin/node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

exports = module.exports = main

var fs = require('fs')
var http_generic = require('./http_generic.node.js')
var log = require('./log.node.js')
var lockers = require('../lib/lockers.node.js')
var msg_io = module.parent.require('../lib/msg_io.node.js')
var http_io = module.parent.require('../lib/http_io.node.js')
var child_io = require('./child_io.node.js')(module)

var shutdown = false
var modules = {}
var modules_locker = lockers()

function main(cio, req, res, file, o, extra) {

    if (!cio.appliedNodeHandler) {
        cio.appliedNodeHandler = true
        cio.on('shutdown', function () {
            // indicates shutdown has been initiated and resources should be freed
            // there may be one or two more requests that come in in which case resources would need to be reallocated and then freed up again
            shutdown = true
            var keys = Object.keys(modules) 
            for (var i = 0; i < keys.length; i++) {
                if (modules[keys[i]]) {
                    modules[keys[i]].cio.shutdown()
                    delete modules[keys[i]]
                }
            }
        })
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
        var stats = o.stats
        var modified = stats.mtime.getTime()
        if(modules[file] && !modules[file].cio.ok)
            delete modules[file]
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
                            delete modules[file]
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
                        child_io.launch(file, file.replace(/.*\//, ''), {}, function (x) {
                            msg_io.extend(x)
                            http_io.extend(x)
                            x.on('http_log', function (o) {
                                cio.http_log.call(cio, o)
                            })
                            modules[file] = { cio: x, modified: modified }
                            goahead(modules[file])
                            modules_locker.unlock(file)
                            if(shutdown && modules[file]) {
                                modules[file].cio.shutdown()
                                delete modules[file]
                            }
                        })
                    }
                })
            })
        }
        function goahead(x) {
            x.cio.http_request(req, res, extra)
        }
    }
    
}
