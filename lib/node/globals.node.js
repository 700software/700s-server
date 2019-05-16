#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(1) }

module.exports = function (scope) {
    scope.htmlE = function (x) {
        return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/^ | $|( ) /mg, '$1&nbsp;').replace(/\n|\r\n?/g, '<br/>')
    }
    scope.attrE = function (x) {
        return x.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    }
}
