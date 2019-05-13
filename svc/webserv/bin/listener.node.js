#!/usr/bin/env node /700s/svc/webserv/lib/child_io.node.js
if (!this.cio) { console.error('Direct usage not permitted. Please use load using child_io.node.js'); process.exit(9) }

var listeners = [
    { name: 'http', host: '*', port: 80, protocol: 'http', docroot: '/700s/web', multiDomain: true, },
]

var path = require('path')
var util = require('util')
var net = require('net')
var dns = require('dns')
var http = require('http')
var fs = require('fs')
var os = require('os')
var child_process = require('child_process')
var log = module.parent.require('../lib/log.node.js')
var http_extra = module.parent.require('../lib/http_extra.node.js')
var lockers = module.parent.require('../lib/lockers.node.js')

module.parent.require('../lib/msg_io.node.js').extend(cio)
module.parent.require('../lib/http_io.node.js').extend(cio)

var closing = false
var connections = []
var locker = lockers()
var listening = []

var todo = 0
var anyYes = false
var anyNo = false
listeners.forEach(function (listener) {

    launch(false)

    function launch(isRetry) {

        var module = listener.protocol == 'http' ? http : null

        listener.disp = function () {
            return listener.name + ' (' + disp() + ')'
        }

        var options = {}
        ++todo; addOptions(function (abort) {
            try {
                if(!abort) {
                    try {
                        listener.server = module.createServer(onrequest)
                    } catch(e) {
                        log.err('Configuration error for listener ' + listener.disp() + ': ' + (e.message || e))
                        return
                    }
                    oncreate()
                }
            } finally {
                if(!--todo) aldone()
            }
        })
        function addOptions(callback) { // add entries to options that might be needed for createServer to work
            callback()
        }
        function oncreate() {
            listener.server.on('connection', function (socket) {
                connections.push(socket)
                cio.locker.add('using')
                socket.on('close', function () {
                    cio.locker.unlock('using')
                    connections.splice(connections.indexOf(socket), 1)
                })
            }).on('error', function (err) {
                listener.listening = false
                log.err((isRetry ? 'After retry: ' : '') + 'Error on listener ' + listener.disp() + ': ' + (err.message || err))
                setTimeout(function () {
                    launch(true)
                    depart()
                }, isRetry ? 10000 : 2000).unref()
            })

            todo++
            listen()
            function listen() {
                if(typeof listener.port == 'number' && listener.host != '*') {
                    dns.lookup(listener.host, function (err, ip) {
                        if(err) {
                            log.err(err.message + ' when looking up ' + listener.host + ' for listener ' + listener.name + ' (port ' + listener.port + ')')
                            proceed()
                        } else {
                            listener.host = ip
                            listener.listening = true
                            listener.server.listen(listener.port, ip, listener.host, proceed)
                        }
                    })
                } else {
                    listener.listening = true
                    listener.server.listen(listener.port, proceed)
                }
            }
            function proceed() {
                log.rotation('listening on ' + disp() + ' (' + listener.name + ')')
                depart()
            }
            function depart() {
                depart = function () {
                    console.error(new Error("Didn't think this could ever be called twice.").stack)
                }
                if(!--todo) aldone()
            }
        }
        function disp() {
            if(typeof listener.port == 'number')
                return listener.host + ':' + listener.port
            else
                return listener.port
        }

        function onrequest(req, res) {

            req.listenerName = listener.name
            req.listenerDocroot = listener.docroot
            req.listenerMultiDomain = listener.multiDomain
            req.protocol = listener.protocol

            var writeHeadO = res.writeHead
            var endO = res.writeHead
            res.writeHead = function () { // during server restart, close connections that had a request in progress
                if(closing && !res.getHeader('Connection'))
                    res.setHeader('Connection', 'Close')
                writeHeadO.apply(this, arguments)
            }
            var socket = req.socket
            socket.http_io_using = true
            var endO = res.end
            res.end = function () {
                if(closing && !res.getHeader('Connection'))
                    req.connection.setTimeout(4000) // shorter timeout to get the connection to close so this process can shut down.
                socket.http_io_using = false
                endO.apply(this, arguments)
            }

            http_extra.sanitize(req, res, cio.http_request) // the callback is only called if the request passed sanitation

        }

    }

})
if(!todo) aldone()

cio.on('shutdown', function () {
    if(anyYes)
        log.rotation(!anyNo ? 'downtime begins' : 'listener shutdown')
    closing = true
    var todo = 0
    listeners.forEach(function (listener) { // closes sockets preventing new connections
        if(listener.listening) {
            todo++; listener.server.close(function () {  // waits for existing http connections to close
                if(!--todo) done()
            })
        }
    })
    for(var i = 0; i < connections.length; i++) // closes any connections it can without producing errors
        if(!connections[i].http_io_using)
            connections[i].destroy()
    if(!todo) done()
    function done() {
        cio.send('listener close') // tells parent that it can end our process, as there will be no additional requests coming in.
    }
})

function aldone() {
    for(var i = 0; i < listeners.length; i++)
        if(listeners[i].listening)
            anyYes = true
        else
            anyNo = true
    if(anyYes && !anyNo)
        log.end('uptime begins')
    if (process.getuid() == 0) { // reduces privileges if launched from root with fork option
        var http_generic = module.parent.require('./http_generic.node.js')
        process.initgroups('webservd', 'webservd')
        process.setgid('webservd')
        process.setuid('webservd')
    }
}

function httpsOptions(listener, callback) {
    var brand = module.filename.replace(/\/[^\/]*\/[^\/]*$/, '').replace(/^.*\//, '')
    var dir = '/700s/var/' + brand
    var options = { }
    callback(false, options)
}

function yyyymmddhhmmss(date) {
    return '' + date.getFullYear() + '-' + zero(date.getMonth() + 1) + '-' + zero(date.getDate()) + ' ' + zero(date.getHours()) + ':' + zero(date.getMinutes()) + ':' + zero(date.getSeconds())
}
function zero(x) {
    if (x < 10)
        return '0' + x
    else
        return x
}
