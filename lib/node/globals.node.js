#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

htmlE = function (x) {
    return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/^ | $|( ) /mg, '$1&nbsp;').replace(/\n|\r\n?/g, '<br/>')
}
attrE = function (x) {
    return x.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
