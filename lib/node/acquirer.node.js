#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }

var path = require('path')
var fs = require('fs')
var vm = require('vm')
var lockers = require('./lockers.node.js')

var cached = {}
var locker = lockers()

module.exports = function (parent) {
    var dirname = parent.filename == null ? null : path.dirname(parent.filename) // repl usage can be null
    return function (file, stats) {
        if (stats && !path.isAbsolute(file))
            throw new Error('If providing stats, please provide the absolute filename.')
        file = path.resolve(dirname, file)
        return new Promise(function (resolve, reject) {
            if (stats)
                onstats(stats)
            else
                fs.stat(file, function (err, stats) {
                    if (err) reject(err)
                    else onstats(stats)
                })
            function onstats(stats) {
                var modified = stats.mtime.getTime()
                if (cached[file] && cached[file].modified == modified) // if module is already loaded
                    resolve(cached[file].exports)
                else
                    loadit()
                function loadit() {
                    var wasQueue = locker.lock(file, function () {

                        if (wasQueue) { // may have just now been loaded
                            fs.stat(file, function (err, stats) { // check stats again in case there was some delay obtaining lock
                                if (err) reject(err)
                                locker.unlock(file) // do this first so that wasQueue will be zero/undefined
                                if (!err) onstats(stats) // check again in case module loaded now
                            })
                            return
                        }
                        
                        // go ahead and load the module
                        fs.readFile(file, 'utf8', function (err, code) {
                            if (err) {
                                reject(err)
                                locker.unlock(file)
                                return
                            }

                            code = code.replace(/^\#\!.*/, '')

                            try {
                                // function method gets compiled inheriting our variables which we don't really want
                                var fun = vm.compileFunction(code, [ 'module', 'exports', 'require' ], {
                                    filename: file,
                                })
                                var moduleFun = {
                                    filename: file,
                                    parent: parent,
                                    exports: {},
                                    modified: modified,
                                    require: function (file2) {
                                        return parent.require(file2.startsWith('./') || file2.startsWith('../') ? path.resolve(path.dirname(file), file2) : file2)
                                    }
                                }
                                moduleFun.require.main = require.main
                                fun(moduleFun, moduleFun.exports, moduleFun.require)
                                var ok = true
                            } catch (err) {
                                reject(err)
                            }

                            if (ok) {
                                moduleFun.unload = function () {
                                    if (cached[file] == this)
                                        delete cached[file]
                                }
                                cached[file] = moduleFun
                                resolve(moduleFun.exports) // fulfill promise
                            }
                            locker.unlock(file)
                        })
                    })
                }
                function goahead(x) {
                    x.cio.http_request(req, res, extra)
                }
            }
        })
    }
}
