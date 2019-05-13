#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

//##
//# Library module used to format stderr logging, which would make its way to /700s/log/webserv.log
//##

var prefix = pad(process.pid, 6) + ' '
exports = module.exports = function () {
    module.exports.info.apply(this, arguments)
}
exports.beg = function () {
    var args = ['+ ']
    args.push.apply(args, arguments)
    logPrefixed.apply(this, args)
}
exports.end = function () {
    var args = ['& ']
    args.push.apply(args, arguments)
    logPrefixed.apply(this, args)
}
exports.err = function () {
    var args = ['! ']
    args.push.apply(args, arguments)
    logPrefixed.apply(this, args)
}
exports.warn = function () {
    var args = ['? ']
    args.push.apply(args, arguments)
    logPrefixed.apply(this, args)
}
exports.info = function () {
    var args = ['> ']
    args.push.apply(args, arguments)
    logPrefixed.apply(this, args)
}
exports.rotation = function () {
    var args = ['. ']
    args.push.apply(args, arguments)
    logPrefixed.apply(this, args)
}

function logPrefixed(flag, message) {
    var stamp = formatStamp(new Date())
    for(var i = 0; i < arguments.length; i++)
        if(arguments[i] instanceof Error)
            arguments[i] = arguments[i].stack
    var lines = Array.prototype.slice.call(arguments, 1).join(' ').split('\n')
    for(var i = 0; i < lines.length; i++)
        process.stderr.write(prefix + stamp + (exports.title ? ' ' + pad(exports.title, 7) : '') + ' : ' + flag + (i==0 ? ': ' : '  ') + lines[i] + '\n')
}

function formatStamp(date) {
    return '' + zero(date.getFullYear() % 100) + zero(date.getMonth() + 1) + zero(date.getDate()) + ' ' + zero(date.getHours()) + ':' + zero(date.getMinutes()) + ':' + zero(date.getSeconds()) + '.' + pad('' + date.getMilliseconds(), 3, '0')
}

function zero(x) {
    if (x < 10)
        return '0' + x
    else
        return x
}

function pad(x, len, c) {
    while(x.length < len)
        x = (c || ' ') + x
    return x
}

