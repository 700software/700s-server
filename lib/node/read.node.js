#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

var stream = require('stream')
module.exports = function (str, encoding) {
    if (encoding) str.setEncoding(encoding)
    var error, end
    var data = []
    var length = 0
    var trigger
    str.on('error', function (_) { error = _; if (trigger) trigger() })
    str.on('end', function () { end = true; if (trigger) trigger() })
    str.on('data', function (_) { data.push(_); length += _.length; if(trigger) trigger(); if(length > 1024*64) { str.pause() } })
    // Thanks to a small bit of code in read, none of these function's callbacks will be called in the same tick. This is to prevent chain-of-event problems and stack overflow errors.
    return { read: read, readAll: readAll, discard: discard }
    function discard() {
        str.removeAllListeners('data')
        str.removeAllListeners('end')
        str.removeAllListeners('error')
        str.addListener('error', function () { }) // TODO is this necessary? Will errors on readable stream be logged to console otherwise?
        str.resume()
        str = null
    }
    function readAll(limit, callback) { // callback includes both err and output if output was truncated due to limit. if there is an error reading (even partially), output will be null and only err will be set
    	if(typeof limit == 'function')
    		callback = limit, limit = 1024*1024 // Default limit of 1 MB (which is actually more on a char stream)
    	var sofar = 0
        var all = encoding ? '' : []
        loop()
        function loop() {
            read(function (err, data) {
                if(err)
                    callback(err)
                else if(data) {
                    sofar += data.length
                    if(typeof data == 'string')
                        all += data
                    else
                        all.push(data)
                    if(sofar > limit) {
                        done(new Error('readAll limit of ' + limit + ' ' + (typeof data == 'string' ? 'chars' : 'bytes')), combined)
                        discard()
                    } else
                        loop()
                } else
                    done()
            })
            function done(truncateErr) {
                if(typeof all == 'string') {
                    callback(truncateErr, all)
                } else {
                    var combined = 0
                    for(var i = 0; i < all.length; i++)
                        combined += all[i].length
                    combined = Buffer.allocUnsafe(combined)
                    for(var i = 0; i < combined.length; i+= add.length) {
                        var add = all.shift()
                        add.copy(combined, i)
                    }
                    callback(truncateErr, combined)
                }
            }
        }
    }
    function read(callback) {
        if (trigger) throw new Error('Already reading')
        process.nextTick(function () {
            if (str.readable) str.resume()
            if (!attempt())
                trigger = function () {
                    trigger = null
                    if (!attempt()) throw Error('Meaningless trigger')
                }
        })
        function attempt() { // Returns true if results found
            if(data[0]) {
                length -= data[0].length
                offset = 0
                callback(null, data.shift())
            } else if(error)
                callback(error)
            else if(end)
                callback()
            else
                return false
            return true
        }
    }
}
