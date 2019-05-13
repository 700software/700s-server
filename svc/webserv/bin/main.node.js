#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

//##
//# Main program called by ../webserv
//# main.node.js is responsible for the command channel, and launches main-go.node.js.
//##
//
// Exit Code 0 = normal exit, not to be automatically restarted
// Exit Code 1 = unexpected error, wdog please restart
// Exit Code 9 = invalid argument, restart wouldn't help
// Exit Code > 128 = kill signal
//
//##

var log = require('../lib/log.node.js')
log.title = require.main.filename.replace(/^.*\//, '')
log.beg('init')

var ending = false
var stopping = false
var main_go = { shutdown: function () { } }
var main_go_onstart = []

var util = require('util')
var child_io = require('../lib/child_io.node.js')(module)
var msg_io = require('../lib/msg_io.node.js')

var mgtc = require('./main-command.node.js')()

handleKills()

startCommandChannel(function () {
    child_io.launch('./main-go.node.js', 'main-go', {}, function (x) { // called when child starts or restarts
        main_go = x
        newMainGo(x)
        function newMainGo(main_go) {
            msg_io.extend(main_go)
        }
    })
})

function startCommandChannel(callback) {
    mgtc.on('listening', function () {
        if(ending) return
        log.rotation('command channel open') // At this point, we know that this is the only instance, because otherwise the process would have already exited.
        callback()
    })
    mgtc.on('command-stop', function () { stop(true) })
    mgtc.on('command-refresh', function () { refresh() })
}

function handleKills() {
    process.on('exit', function (code) {
        log.end('exit')
        if (process.version.match(/^v0\.\d\b|v0\.10\b/) && !code) // versions <= 0.10.* where process.exitCode is not part of the API
            process.exit(process.exitCode) // do it ourselves
    })
    process.on('uncaughtException', function (err) {
        log.err('Uncaught ' + err.stack)
        process.exitCode = 1
        stop()
    })
    //process.on('SIGTERM', function () { // kill is kill is kill
    //    stop()
    //    if(!process.exitCode) process.exitCode = 128 + 15
    //})
    process.on('SIGINT', function () { // Ctrl+C
        stop(!ending)
        if(!process.exitCode) process.exitCode = 128 + 2
    })
    process.on('SIGHUP', function () { refresh() }) // ../refresh
}

function refresh() {
    if(main_go.ok)
        main_go.send('refresh')
}

function stop(graceful) { // passes appropriate stop commands to mgtc and main_go
    if(stopping)
        return
    stopping = !graceful
    if(ending) { // already ending graceful
        if(!graceful) {
            stoppStuff()
            stopping = true
        }
    } else {
        if(graceful) {
            log.beg('graceful shutdown')
            setTimeout(function () {
                log.err('interrupting open callbacks after 5 minutes of no shutdown:\n' + describeHandles(process._getActiveHandles()))
                if(!process.exitCode) process.exitCode = 9
                process.exit()
            }, 1000 * 60 * 5).unref() // 5 minute maximum when waiting for shutdown.
        } else
            stoppStuff()
        ending = true
        mgtc.removeAllListeners('listening')
        main_go.shutdown()
        mgtc.end()
    }
    function stoppStuff() { // non-graceful shutdown // usually an error event, but not necessarily
        log.beg('stopping')
        setTimeout(function () {
            log.err('interrupting open callbacks:\n' + describeHandles(process._getActiveHandles()))
            if(!process.exitCode) process.exitCode = 9
            process.exit()
        }, 1000).unref()
    }
}

function describeHandles(handles) {
	var x = ''
	for(var i = 0; i < handles.length; i++)
		x += '\n' + (i+1) + ' of ' + handles.length + ': ' + handles[i]
		        + (''
                //+ '\n' + util.inspect(handles[i])
		        + (handles[i] == '[object Timer]' && handles[i].ontimeout ? '\n' + handles[i].ontimeout : '')
		        ).replace(/^/mg, '        ')
	return x.substring(1)
}
