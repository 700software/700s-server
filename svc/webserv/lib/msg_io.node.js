#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

exports.extend = function (cio) {
    cio.send = function (message) {
        cio.linked.emit('message', message)
    }
}
