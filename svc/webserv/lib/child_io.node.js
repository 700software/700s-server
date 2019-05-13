#!/usr/bin/env node

var events = require('events')
var fs = require('fs')
var path = require('path')
var vm = require('vm')
var events = require('events')
var stream = require('stream')
var lockers = require('../lib/lockers.node.js')
var log = require('../lib/log.node.js')

module.exports = child_io

function child_io(parent) {
    return {
        launch: function (cpath, title, options, onlaunch) {
            launch()
            function launch() {
                var going = new Date().getTime()
                var apath = isAbsolute(cpath) ? cpath : path.resolve(path.dirname(parent.filename), cpath)
                var rpath = isAbsolute(cpath) ? cpath : path.relative(path.dirname(module.filename), apath)
                var pcio = new events.EventEmitter()
                
                var pstdin = new stream.Readable()
                var cio = new events.EventEmitter()
                linkStreams(cio, pcio)
                readCompile(apath, cio, function (err, run) {
                    if(err) {
                        pcio.error(err)
                        return
                    }
                    cio.linkedName = 'parent'
                    prepCio(cio, true)
                    run()
                    //startReadLoop(cio)
                    onlaunch(pcio)
                })
                cio.on('error', function (err) { throw err }) // child should not be handling parent errors in same process
                
                pcio.linkedName = title
                prepCio(pcio, false)
                pcio.on('error', function (err) { // error in child process, child should end automaticaly
                    log.err('Yikes! ' + title + ' Connection', err.stack || err)
                })
                pcio.restart = function () {
                    pcio.shutdown()
                    log.beg('restarting ' + title)
                    launch()
                }
            }
        }
    }
}

function readCompile(mpath, cio, callback) {
    fs.readFile(mpath, 'utf8', function (err, code) { if(err) { callback(err); return }
        code = code.replace(/^\#\!.*/, '')
        var context = { }
        for(var x in global)
            context[x] = global[x]
        context.require = function (id) {
            if(id.match(/^\.\.?\//)) {
                throw new Error('Relative paths not recommended here. Use module.parent.require to override.')
            } else
                return require.apply(global, arguments)
        }
        context.require.main = require.main
        delete context.exports
        context.module = { parent: module, filename: mpath }
        context.global = context
        context.cio = cio
        callback(null, function () {
            vm.runInNewContext(code, context, mpath)
        })
    })
}

function prepCio(cio, child) {
    var closed = false
    var errored = false
    cio.ok = true
    cio.locker = lockers()
    //cio.input.on('error', function (err) {
    //    cio.error('Read ' + err)
    //})
    //cio.output.on('error', function (err) {
    //    cio.error('Write ' + err.stack)
    //})
    cio.on('close', function () {
        if(!cio.shutdowning)
            cio.error('Unexpected Shutdown')
        else
            setClosed()
    })
    cio.error = function (err) { // because a separate error event is emitted for every write command
        if (errored) {
            log.err(cio.linkedName + ' Subsequent', err.stack || err)
        } else {
            cio.emit('error', err)
            errored = true
            setClosed()
        }
    }
    
    cio.shutdown = function () {
        if (!cio.ok)
            return
        cio.shutdowning = true
        cio.ok = false
        cio.linked.emit('shutdown')
    }

    function setClosed() {
        closed = true
        cio.ok = false // for unexpected shutdowns
    }
}

function linkStreams(cio, pcio) {
    ourPipe(pcio, cio)
    ourPipe(cio, pcio)
    function ourPipe(readable, writable) {
        readable.linked = writable
    }
}

function isAbsolute(x) {
    if(path.isAbsolute)
        return path.isAbsolute.apply(this, arguments)
    else // Node <= 0.10
        return x.charAt(0) == '/'
}

