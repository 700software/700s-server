#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

//##
//# Called by main.node.js. Sets up and manages command channels in /tmp.
//##

var usrWebservd = 80 // 'webservd'
var grpRoot = 0

var crypto = require('crypto')
var events = require('events')
var fs = require('fs')
var http = require('http')
var url = require('url')

var log = require('../lib/log.node.js')

var brand = module.filename.match(/([^\/]+)\/[^\/]+\/[^\/]+$/)[1]

exports = module.exports = function () {
    var exports = new events.EventEmitter()

    var checkedAlreadyRunning = false
    
    var ending = false
    var passThere = false
    
    var server
    var req
    
    crypto.randomBytes(16, function (err, random) { if(err) throw err
        var password = random.toString('base64')
        if(!ending)
            server = http.createServer(requestHandler).on('connection', function (socket) {
                socket.setTimeout(5000)
            }).on('listening', function () {
                fs.chown('/tmp/.' + brand + '.sock', usrWebservd, grpRoot, function () { })
                if(!ending) // I wonder if it would be good to set the Sticky Bit as well?
                    fs.unlink('/tmp/.' + brand + '.pass', function (err) { if(err && err.code != 'ENOENT') throw err // remove in case it was there for different user or something
                        if(!ending)
                            fs.writeFile('/tmp/.' + brand + '.pass', '', { mode: 0600 }, function (err) { if(err) throw err // create empty at first, with mode 0600
                                if(ending)
                                    fs.unlink('/tmp/.' + brand + '.pass')
                                else {
                                    fs.chown('/tmp/.' + brand + '.pass', usrWebservd, grpRoot, function () { })
                                    passThere = true
                                    fs.lstat('/tmp/.' + brand + '.pass', function (err, stats) {
                                        if(ending) return
                                        if(err) throw err
                                        if ((stats.uid == process.getuid() || stats.uid == usrWebservd) && stats.mode % 01000 == 0600 && stats.isFile()) // verify everything is in order
                                            fs.writeFile('/tmp/.' + brand + '.pass', password, { mode: 0600 }, function (err) { if(err) throw err
                                                if(ending)
                                                    fs.unlink('/tmp/.' + brand + '.pass', function (err) { if(err && err.code != 'ENOENT') throw err })
                                            })
                                        else
                                            throw Error('unexpected stats! ' + JSON.stringify(stats))
                                    })
                                }
                            })
                    })
                exports.emit('listening')
            }).once('error', function (err) {
                if(ending)
                    return
                if(err.code == 'EADDRINUSE') {
                    log.warn('an instance may already be running.')
                    var timer = setTimeout(function () {
                        if(req == null)
                            return
                        log.rotation('no response, assuming other instance was killed.')
                        req.abort()
                        req.removeAllListeners('response')
                        req.removeAllListeners('error')
                        req.on('error', function () { })
                        replaceIt()
                    }, 1000)
                    req = http.request({
                        socketPath: '/tmp/.' + brand + '.sock',
                        path: '/',
                        headers: { 'Connection': 'close' },
                        agent: false,
                    }, function (res) {
                        clearTimeout(timer)
                        log.err('an instance is already running.')
                        process.exit(9) // exit code 9 to prevent auto-restart because an instance is already running.
                    })
                    req.on('error', function (err) {
                        if(ending)
                            return
                        clearTimeout(timer)
                        if(err.code == 'ECONNREFUSED') {
                            log.rotation(err + ', assuming other instance was killed.')
                            replaceIt()
                        } else {
                            log.warn('when attempting to verify other instance: ' + err)
                            process.exit(err.code == 'EACCES' ? 9 : 1) // exit code 9 to prevent auto-restart because running with wrong permissions
                        }
                    })
                    req.end()
                } else
                    throw err
                function replaceIt() { // clean up after previous process
                    req = null
                    if (ending)
                        return
                    fs.unlink('/tmp/.' + brand + '.sock', function (err) { if(err && err.code != 'ENOENT') throw err
                        server.listen('/tmp/.' + brand + '.sock', function () {
                            log.rotation('overwrite listener from other instance.')
                        })
                    })
                }
            }).listen('/tmp/.' + brand + '.sock')
            
        function requestHandler(req, res) {
            var path = url.parse(req.url).pathname
            if(path == '/') {
                res.end() // no action, called by self below to detect whether instance is running
            } else if(req.headers['z-pass'] == password) {
                if(path == '/command-stop') {
                    exports.emit(path.substring(1))
                    res.end() // ends after listener has stopped
                } else {
                    log.warn('main-management received unexpected request:', pathname)
                    err500()
                }
            } else {
                log.warn('main-management access denied because invalid password')
                err500()
            }
            function err500() {
                res.writeHead(500)
                res.end('HTTP 500')
            }
        }
    })
    
    exports.end = function (callback) {
        ending = true
        if(passThere)
            fs.unlink('/tmp/.' + brand + '.pass', function (err) { if(err && err.code != 'ENOENT') throw err })
        if(req) {
            req.abort()
            if(callback) callback()
        } else 
            try {
                server.close(callback)
            } catch(ex) { // Not Listening
                if(callback) callback()
            }
    }
    
    return exports
    
}

