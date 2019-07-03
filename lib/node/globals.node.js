#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

htmlE = function (x) {
    return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/^ | $|( ) /mg, '$1&nbsp;').replace(/\n|\r\n?/g, '<br/>')
}
attrE = function (x) {
    return x.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
flattenArrays = function (params) {
    var param1 = {}
    for (var x in params)
        param1[x] = typeof params[x] == 'string' ? params[x] : params[x].join('\u0000')
    return param1
}
sleep = function (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms)
    })
}
buffer2string = function (o) {
    if (Buffer.isBuffer(o))
        return o.toString()
    for (var x in o)
        if (Buffer.isBuffer(o[x]))
            o[x] = o[x].toString()
    return o
}
