#!/usr/bin/env node

//##
//# This is the stop program called by ../stop.
//##

var http = require('http')
var fs = require('fs')

var brand = module.filename.match(/([^\/]+)\/[^\/]+\/[^\/]+$/)[1]

setTimeout(function () {
    var child_process = require('child_process')
    child_process.spawn('pkill', ['-9', brand])
}, 1000 * 60 * 5).unref() // forcibly kill after 5 minutes

// try graceful shutdown
fs.readFile('/tmp/.' + brand + '.pass', 'utf8', function (err, password) {
    if(err) {
        if(err.code == 'ENOENT')
            console.error(brand + ' does not seem to be running.')
        else
            console.error('error retreiving token needed to signal ' + brand + ': ' + err.message)
        process.exit(1)
    }
    var timer = setTimeout(function () {
        console.error('command timeout, assuming ' + brand + ' was already killed.')
        req.removeAllListeners('error')
        req.on('error', function () { })
        req.abort()
    }, 1000)
    var req = http.request({
        socketPath: '/tmp/.' + brand + '.sock',
        path: '/command-stop',
        headers: {
            'Z-Pass': password,
        },
    }, function (res) {
        clearTimeout(timer)
        if(res.statusCode != 200) {
            console.error('error stopping ' + brand + '.') 
            process.exit(1)
        } else {
            setTimeout(waitForEnd, 100)
        }
    })
    req.on('error', function (err) {
        clearTimeout(timer)
        if(err.code == 'ECONNREFUSED') {
            console.error('command refused, assuming ' + brand + ' was already killed.')
        } else if (err.code == 'ENOENT') {
            console.error(brand + ' does not seem to be running.')
            fs.unlink('/tmp/.' + brand + '.pass', function () { })
            process.exit(1)
        } else
            throw err
    })
    req.end()
    function waitForEnd() {
        var timer = setTimeout(function () {
            console.error('query timeout, assuming ' + brand + ' was killed.')
            req.removeAllListeners('error')
            req.on('error', function () { })
            req.abort()
        }, 1000)
        var req = http.request({
            socketPath: '/tmp/.' + brand + '.sock',
            path: '/',
        }, function (res) {
            clearTimeout(timer)
            setTimeout(waitForEnd, 100)
        })
        req.on('error', function (err) {
            clearTimeout(timer)
            if(err.code == 'ECONNREFUSED' || err.code == 'ENOENT') {
                // end normally
            } else
                throw err
        })
        req.end()
    }
})
