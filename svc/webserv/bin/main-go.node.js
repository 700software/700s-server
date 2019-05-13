#!/usr/bin/env node /700s/svc/webserv/lib/child_io.node.js
if (!this.cio) { console.error('Direct usage not permitted. Please use load using child_io.node.js'); process.exit(9) }

//##
//# Called by ./main.node.js after command channel listener has been established.
//# main-go.node.js launches listener.node.js as well as dispatcher.node.js, and pipes http_io communication between them.
//##
//#
//##

module.parent.require('../lib/msg_io.node.js').extend(cio)

var util = require('util')

var log = module.parent.require('../lib/log.node.js')
var msg_io = module.parent.require('../lib/msg_io.node.js')
var http_io = module.parent.require('../lib/http_io.node.js')
var lockers = module.parent.require('../lib/lockers.node.js')
var child_io = module.parent.exports(module)

var listener = { shutdown: function () { }, locker: lockers() }

child_io.launch('./listener.node.js', 'listen', {
}, function (x) { // called when child starts or restarts
    listener = x
    newListener(x)
    function newListener(listener) { // separate function to ensure we are referring to the right listener

        var dispatcher
        theDispatcher()
        
        listener.locker.add('using')
        msg_io.extend(listener)
        listener.on('message', function (msg) {
            if(msg == 'listener close') {
                listener.locker.unlock('using')
                dispatcher.shutdown()
            }
        })
        
        listener.on('error', function () {
            dispatcher.shutdown()
        })

        http_io.extend(listener)
        listener.on('http_log', function () {
            main_log.log.apply(null, arguments)
        })
        listener.on('http_request', function (req, res) {
        
            if(!dispatcher.ok) { // after error or end
                log.warn('request came in, restarting dispatcher')
                theDispatcher() // restart, updates dispatcher variable
            }
            dispatcher.http_request(req, res)
        })
        
        function theDispatcher() {
            child_io.launch('./dispatcher.node.js', 'dispatch', {
            }, function (x) { // called when child starts or restarts
                dispatcher = x
                newDispatcher(x)
                function newDispatcher(dispatcher) {
                    msg_io.extend(dispatcher)
                    http_io.extend(dispatcher)
                    dispatcher.on('http_log', function (o) {
                        main_log.log.call(null, o)
                    })
                }
            })
        }
    }
})

cio.on('shutdown', function () {
    listener.shutdown()
})
